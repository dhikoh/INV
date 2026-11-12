import { OrderStatus, Prisma, Role } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError, fromDb, Rupiah } from '@/lib/domain/money';
import { customerScope } from './scopes';

export interface CustomerTransactionPriceDto {
  orderItemId: string;
  orderId: string;
  orderNo: string | null;
  orderDate: string;
  orderStatus: OrderStatus;
  salesName: string;
  productId: string;
  productSku: string;
  productName: string;
  unit: string;
  qty: number;
  listPrice: Rupiah;
  unitPrice: Rupiah;
  discountType: string;
  discountSource: string;
  lineDiscount: Rupiah;
  lineNet: Rupiah;
  effectiveUnitPrice: Rupiah;
}

type PrismaLike = Pick<typeof defaultPrisma, 'customer' | 'order' | 'user'>;

/**
 * Mengambil riwayat harga transaksi riil untuk pelanggan ini (aman untuk Sales & Super Admin).
 * GARANSI ZERO-LEAKAGE: Dilarang keras menyertakan costPrice, HPP, profit, margin, atau overrideNote.
 */
export async function getCustomerTransactionPrices(
  db: PrismaLike,
  ctx: Ctx,
  customerId: string,
  options?: { productId?: string; limit?: number }
): Promise<CustomerTransactionPriceDto[]> {
  const businessId = requireBusiness(ctx);
  const scope = customerScope(ctx, businessId);

  const customer = await db.customer.findFirst({
    where: { ...scope, id: customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
  }

  const orderWhere: Prisma.OrderWhereInput = {
    businessId,
    customerId: customer.id,
    deletedAt: null,
    status: {
      notIn: [
        OrderStatus.DRAFT,
        OrderStatus.CANCELLED,
      ],
    },
    ...(ctx.role === Role.SALES ? { salesId: ctx.user.id } : {}),
  };

  const orders = await db.order.findMany({
    where: orderWhere,
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    take: options?.limit ?? 50,
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      status: true,
      salesId: true,
      items: {
        ...(options?.productId ? { where: { productId: options.productId } } : {}),
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          productId: true,
          sku: true,
          productName: true,
          unit: true,
          qty: true,
          listPrice: true,
          unitPrice: true,
          discountType: true,
          discountSource: true,
          lineDiscount: true,
          lineNet: true,
        },
      },
    },
  });

  if (orders.length === 0) {
    return [];
  }

  const salesIds = Array.from(new Set(orders.map((o) => o.salesId)));
  const salesUsers =
    salesIds.length > 0 && typeof db.user?.findMany === 'function'
      ? await db.user.findMany({
          where: { id: { in: salesIds } },
          select: { id: true, name: true },
        })
      : [];
  const salesMap = new Map(salesUsers.map((u) => [u.id, u.name]));

  const rows: CustomerTransactionPriceDto[] = [];
  for (const ord of orders) {
    const salesName = salesMap.get(ord.salesId) ?? 'Staf';
    for (const item of ord.items) {
      const lineNet = fromDb(item.lineNet);
      const effectiveUnitPrice =
        item.qty > 0 ? Math.round(lineNet / item.qty) : fromDb(item.unitPrice);

      rows.push({
        orderItemId: item.id,
        orderId: ord.id,
        orderNo: ord.orderNo,
        orderDate: ord.orderDate.toISOString(),
        orderStatus: ord.status,
        salesName,
        productId: item.productId,
        productSku: item.sku,
        productName: item.productName,
        unit: item.unit,
        qty: item.qty,
        listPrice: fromDb(item.listPrice),
        unitPrice: fromDb(item.unitPrice),
        discountType: item.discountType,
        discountSource: item.discountSource,
        lineDiscount: fromDb(item.lineDiscount),
        lineNet,
        effectiveUnitPrice,
      });
    }
  }

  return rows;
}

