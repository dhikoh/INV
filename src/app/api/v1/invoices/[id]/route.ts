import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role, OrderStatus, InvoiceStatus } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import { calculateOrderProfitData } from '@/lib/services/commission';

/**
 * GET /api/v1/invoices/:id
 * Role: SUPERADMIN & SALES
 *
 * Mengambil detail invoice komprehensif.
 * - Staf Sales dibatasi hanya pada invoice dari pesanannya sendiri.
 * - Anti-leakage: HPP, margin, floorPrice, dan simulasi profit HANYA dikembalikan untuk Super Admin.
 * - Menyediakan data inspeksi persetujuan untuk Super Admin (profit, belowMin, ketersediaan stok, riwayat customer).
 *
 * Rujukan: Seksi 7.4, 7.11, 10.5, 11.4 & 14.3 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID Invoice tidak valid', 400);
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        businessId,
        deletedAt: null,
      },
    });

    if (!invoice) {
      throw new DomainError('INVOICE_NOT_FOUND', 'Invoice tidak ditemukan', 404);
    }

    const order = await prisma.order.findFirst({
      where: {
        id: invoice.orderId,
        businessId,
        deletedAt: null,
      },
      include: {
        customer: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!order) {
      throw new DomainError('ORDER_NOT_FOUND', 'Pesanan tidak ditemukan', 404);
    }

    // Pembatasan Staf Sales: hanya boleh mengakses invoice dari pesanannya sendiri
    if (ctx.user.role === Role.SALES && order.salesId !== ctx.user.id) {
      throw new DomainError(
        'FORBIDDEN',
        'Anda hanya dapat mengakses invoice dari pesanan Anda sendiri',
        403
      );
    }

    const [sales, bankAccounts, payments] = await Promise.all([
      prisma.user.findFirst({
        where: { id: order.salesId },
        select: { id: true, name: true, username: true },
      }),
      prisma.bankAccount.findMany({
        where: {
          businessId,
          deletedAt: null,
        },
        select: {
          id: true,
          bankName: true,
          accountNumber: true,
          accountHolder: true,
          isDefault: true,
        },
        orderBy: { isDefault: 'desc' },
      }),
      typeof prisma.payment?.findMany === 'function'
        ? prisma.payment.findMany({
            where: {
              businessId,
              orderId: order.id,
            },
            orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
            select: {
              id: true,
              invoiceId: true,
              receiptNo: true,
              verifyToken: true,
              method: true,
              status: true,
              amount: true,
              paidAt: true,
              reference: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const isSuperAdmin = ctx.user.role === Role.SUPERADMIN;

    // Data spesifik Super Admin: Simulasi Profit, Ketersediaan Stok, BelowMin, dan Statistik Customer
    let profitSimulation = null;
    let belowMinItems = null;
    let customerStats = null;
    let stockAvailability = null;

    if (isSuperAdmin) {
      // 1. Simulasi Profit
      try {
        const { profitResult, orderCosts } = await calculateOrderProfitData(
          prisma,
          order.id,
          businessId
        );
        const commissionEntry = await prisma.commissionEntry.findFirst({
          where: { orderId: order.id, businessId },
        });

        profitSimulation = {
          goodsRevenue: profitResult.goodsRevenue,
          shippingCharge: Number(order.shippingCharge),
          revenue: profitResult.revenue,
          cogs: profitResult.cogs,
          shippingActualCost: profitResult.shippingActualCost,
          shippingSubsidy: profitResult.shippingSubsidy,
          extraCosts: profitResult.extraCosts,
          profit: profitResult.profit,
          marginBps: profitResult.marginBps,
          commissionAmount: commissionEntry ? Number(commissionEntry.amount) : 0,
          costs: orderCosts.map((c) => ({
            id: c.id,
            label: c.label,
            amount: Number(c.amount),
          })),
        };
      } catch {
        profitSimulation = null;
      }

      // 2. Item di Bawah Minimal (BelowMin)
      belowMinItems = order.items
        .filter((it) => it.belowMin)
        .map((it) => {
          const unitPrice = Number(it.unitPrice);
          const minPrice = Number(it.floorPrice);
          return {
            id: it.id,
            productName: it.productName,
            sku: it.sku,
            qty: it.qty,
            unitPrice,
            minPriceSnapshot: minPrice,
            priceGap: Math.max(0, minPrice - unitPrice),
            belowMinReason: order.belowMinReason,
          };
        });

      // 3. Statistik Pelanggan
      const [orderCount, activeOrders] = await Promise.all([
        prisma.order.count({
          where: {
            businessId,
            customerId: order.customerId,
            deletedAt: null,
            status: { not: OrderStatus.CANCELLED },
          },
        }),
        prisma.order.findMany({
          where: {
            businessId,
            customerId: order.customerId,
            deletedAt: null,
            status: {
              in: [
                OrderStatus.AWAITING_DP,
                OrderStatus.IN_PROCESS,
                OrderStatus.FINAL_PENDING_APPROVAL,
                OrderStatus.AWAITING_FINAL_PAYMENT,
              ],
            },
          },
          select: {
            grandTotal: true,
            paidTotal: true,
          },
        }),
      ]);

      const openReceivables = activeOrders.reduce(
        (sum, ord) =>
          sum + Math.max(0, Number(ord.grandTotal) - Number(ord.paidTotal)),
        0
      );

      customerStats = {
        orderCount,
        openReceivables,
      };

      // 4. Ketersediaan Stok Fisik vs Order
      const productIds = Array.from(new Set(order.items.map((it) => it.productId)));
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, businessId },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      stockAvailability = order.items.map((it) => {
        const prod = productMap.get(it.productId);
        const physicalStock = prod ? prod.stockQty : 0;
        const reservedStock = prod ? prod.reservedQty : 0;
        const availableStock =
          invoice.status === InvoiceStatus.APPROVED
            ? physicalStock - reservedStock + it.qty
            : physicalStock - reservedStock;

        return {
          productId: it.productId,
          productName: it.productName,
          sku: it.sku,
          orderedQty: it.qty,
          physicalStock,
          reservedStock,
          availableStock,
          isSufficient: availableStock >= it.qty,
        };
      });
    }

    // Format DTO item tanpa membocorkan HPP ke Sales
    const items = order.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      sku: it.sku,
      unit: it.unit,
      qty: it.qty,
      unitPrice: Number(it.unitPrice),
      discountType: it.discountType,
      discountValue: Number(it.discountValue),
      lineSubtotal: Number(it.lineSubtotal),
      lineDiscount: Number(it.lineDiscount),
      lineNet: Number(it.lineNet),
      belowMin: it.belowMin,
      ...(isSuperAdmin ? { floorPrice: Number(it.floorPrice) } : {}),
    }));

    return {
      status: 200,
      data: {
        id: invoice.id,
        invoiceNo: invoice.number,
        type: invoice.type,
        status: invoice.status,
        theme: invoice.theme,
        version: invoice.version,
        rev: invoice.rev,
        amount: Number(invoice.amount),
        paidAmount: Number(invoice.paidAmount),
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
        issuedAt: invoice.issueDate ? invoice.issueDate.toISOString() : null,
        approvedAt: invoice.approvedAt ? invoice.approvedAt.toISOString() : null,
        rejectedAt:
          invoice.status === InvoiceStatus.REJECTED
            ? invoice.updatedAt.toISOString()
            : null,
        rejectionReason: invoice.rejectReason,
        voidReason: invoice.voidReason,
        verifyToken: invoice.verifyToken ?? null,
        overrideNote: isSuperAdmin ? order.overrideNote : null,
        snapshot: invoice.snapshot,
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
        customer: {
          id: order.customer.id,
          code: order.customer.code,
          name: order.customer.name,
          phone: order.customer.phone,
          address: order.customer.address,
        },
        order: {
          id: order.id,
          orderNo: order.orderNo,
          orderDate: order.orderDate.toISOString(),
          status: order.status,
          subtotal: Number(order.subtotal),
          discountTotal: Number(order.discountTotal),
          shippingCharge: Number(order.shippingCharge),
          ppnEnabled: order.ppnEnabled,
          ppnRateBps: order.ppnRateBps,
          ppnAmount: Number(order.ppnAmount),
          grandTotal: Number(order.grandTotal),
          paidTotal: Number(order.paidTotal),
          dpAmount: Number(order.dpAmount),
          dpBps: order.dpBps,
          hasBelowMin: order.hasBelowMin,
          belowMinReason: order.belowMinReason,
          rev: order.rev,
          deliveryAddress: order.deliveryAddress,
          notes: order.notes,
          sales: sales ? { id: sales.id, name: sales.name, username: sales.username } : null,
          items,
        },
        bankAccounts,
        payments: (payments ?? []).map((p) => ({
          id: p.id,
          invoiceId: p.invoiceId,
          receiptNo: p.receiptNo ?? null,
          verifyToken: p.verifyToken ?? null,
          method: p.method,
          status: p.status,
          amount: Number(p.amount),
          paidAt: p.paidAt.toISOString(),
          reference: p.reference,
        })),
        profitSimulation,
        belowMinItems,
        customerStats,
        stockAvailability,
      },
    };
  }
);
