import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as requestFinalHandler } from '@/app/api/v1/orders/[id]/request-final/route';
import { POST as voidInvoiceHandler } from '@/app/api/v1/invoices/[id]/void/route';
import {
  GET as getShipmentHandler,
  POST as upsertShipmentHandler,
} from '@/app/api/v1/orders/[id]/shipment/route';
import { POST as shipOrderHandler } from '@/app/api/v1/orders/[id]/shipment/ship/route';
import { POST as deliverOrderHandler } from '@/app/api/v1/orders/[id]/shipment/deliver/route';
import { requestFinalOrder, withdrawOrder, TxClient } from '@/lib/services/order';
import { voidInvoice } from '@/lib/services/invoice';
import {
  getShipment,
  upsertShipment,
  shipOrder,
  deliverOrder,
} from '@/lib/services/shipment';
import {
  Role,
  OrderStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  ShipStatus,
  ShipMethod,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import type { Ctx } from '@/lib/auth/context';

interface MockBusiness {
  id: string;
  name: string;
  enablePpn: boolean;
  ppnRateBps: number;
  requirePaidBeforeShip: boolean;
}

interface MockCustomer {
  id: string;
  businessId: string;
  code: string;
  name: string;
  deletedAt: Date | null;
}

interface MockOrderItem {
  id: string;
  orderId: string;
  productId: string;
  qty: number;
  unitPrice: bigint;
  lineSubtotal: bigint;
  discountType: string | null;
  discountValue: bigint | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  name: string;
  stockQty: number;
  reservedQty: number;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  version: number;
  rev: number;
  orderNo: string | null;
  customerSeq: number | null;
  shippingCharge: bigint;
  shippingReason: string | null;
  subtotal: bigint;
  ppnAmount: bigint;
  grandTotal: bigint;
  dpAmount: bigint;
  paidTotal: bigint;
  creditTotal: bigint;
  stockReserved: boolean;
  rejectReason: string | null;
  deletedAt: Date | null;
}

interface MockInvoice {
  id: string;
  businessId: string;
  orderId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  version: number;
  number: string | null;
  amount: bigint;
  paidAmount: bigint;
  notes: string | null;
  deletedAt: Date | null;
}

interface MockShipment {
  id: string;
  businessId: string;
  orderId: string;
  method: ShipMethod;
  transporterId: string | null;
  trackingNo: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  receiverName: string | null;
  status: ShipStatus;
  deliveryNo: string | null;
  actualCost: bigint;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let businesses: MockBusiness[] = [];
let customers: MockCustomer[] = [];
let products: MockProduct[] = [];
let orders: MockOrder[] = [];
let orderItems: MockOrderItem[] = [];
let invoices: MockInvoice[] = [];
let payments: Record<string, unknown>[] = [];
let shipments: MockShipment[] = [];
let auditLogs: Record<string, unknown>[] = [];
let notifications: Record<string, unknown>[] = [];

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    business: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return businesses.find((b) => b.id === where.id) || null;
      }),
    },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return customers.find((c) => c.id === where.id && c.businessId === where.businessId) || null;
      }),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = (where.id as { in?: string[] })?.in || [];
        return products.filter((p) => ids.includes(p.id) && p.businessId === where.businessId);
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return products.find((p) => p.id === where.id && p.businessId === where.businessId) || null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < products.length; i++) {
          if (where.id && products[i].id !== where.id) continue;
          if (where.businessId && products[i].businessId !== where.businessId) continue;
          const updated = { ...products[i] };
          if (data.reservedQty && typeof data.reservedQty === 'object') {
            const op = data.reservedQty as { increment?: number; decrement?: number };
            if (op.increment) updated.reservedQty += op.increment;
            if (op.decrement) updated.reservedQty -= op.decrement;
          }
          if (data.stockQty && typeof data.stockQty === 'object') {
            const op = data.stockQty as { increment?: number; decrement?: number };
            if (op.increment) updated.stockQty += op.increment;
            if (op.decrement) updated.stockQty -= op.decrement;
          }
          products[i] = updated;
          count++;
        }
        return { count };
      }),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        return { id: `sm_${Date.now()}`, ...data };
      }),
    },
    order: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ord = orders.find((o) => {
          if (where.id && o.id !== where.id) return false;
          if (where.businessId && o.businessId !== where.businessId) return false;
          if (where.deletedAt === null && o.deletedAt !== null) return false;
          return true;
        });
        if (!ord) return null;
        const cust = customers.find((c) => c.id === ord.customerId);
        const itms = orderItems
          .filter((i) => i.orderId === ord.id)
          .map((i) => ({
            ...i,
            product: products.find((p) => p.id === i.productId),
          }));
        return { ...ord, customer: cust, items: itms };
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ord = orders.find((o) => o.id === where.id && o.businessId === where.businessId);
        if (!ord) throw new Error('Order not found');
        const cust = customers.find((c) => c.id === ord.customerId);
        const itms = orderItems
          .filter((i) => i.orderId === ord.id)
          .map((i) => ({
            ...i,
            product: products.find((p) => p.id === i.productId),
          }));
        return { ...ord, customer: cust, items: itms };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < orders.length; i++) {
          if (where.id && orders[i].id !== where.id) continue;
          if (where.businessId && orders[i].businessId !== where.businessId) continue;
          const updated = { ...orders[i] };
          for (const [k, v] of Object.entries(data)) {
            if (k === 'rev' && typeof v === 'object' && v && 'increment' in v) {
              updated.rev += 1;
            } else if (k === 'version' && typeof v === 'object' && v && 'increment' in v) {
              updated.version += 1;
            } else {
              (updated as unknown as Record<string, unknown>)[k] = v;
            }
          }
          orders[i] = updated;
          count++;
        }
        return { count };
      }),
    },
    invoice: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          invoices.find((inv) => {
            if (where.id && inv.id !== where.id) return false;
            if (where.orderId && inv.orderId !== where.orderId) return false;
            if (where.businessId && inv.businessId !== where.businessId) return false;
            if (where.type && inv.type !== where.type) return false;
            if (where.status && inv.status !== where.status) return false;
            if (where.deletedAt === null && inv.deletedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const inv = invoices.find((i) => i.id === where.id && i.businessId === where.businessId);
        if (!inv) throw new Error('Invoice not found');
        return inv;
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return invoices.filter((inv) => {
          if (where.orderId && inv.orderId !== where.orderId) return false;
          if (where.businessId && inv.businessId !== where.businessId) return false;
          if (where.type && inv.type !== where.type) return false;
          if (where.status && typeof where.status === 'object' && 'in' in (where.status as Record<string, unknown>)) {
            const list = (where.status as { in: string[] }).in;
            if (!list.includes(inv.status)) return false;
          }
          return true;
        }).length;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const newInv: MockInvoice = {
          id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          businessId: data.businessId as string,
          orderId: data.orderId as string,
          type: data.type as InvoiceType,
          status: data.status as InvoiceStatus,
          version: data.version as number,
          number: (data.number as string) || null,
          amount: data.amount as bigint,
          paidAmount: BigInt(0),
          notes: (data.notes as string) || null,
          deletedAt: null,
        };
        invoices.push(newInv);
        return newInv;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < invoices.length; i++) {
          if (where.id && invoices[i].id !== where.id) continue;
          if (where.businessId && invoices[i].businessId !== where.businessId) continue;
          invoices[i] = { ...invoices[i], ...data };
          count++;
        }
        return { count };
      }),
    },
    payment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          payments.find((p) => {
            if (where.invoiceId && p.invoiceId !== where.invoiceId) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.status && p.status !== where.status) return false;
            return true;
          }) || null
        );
      }),
    },
    shipment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          shipments.find((s) => {
            if (where.id && s.id !== where.id) return false;
            if (where.orderId && s.orderId !== where.orderId) return false;
            if (where.businessId && s.businessId !== where.businessId) return false;
            return true;
          }) || null
        );
      }),
      findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const s = shipments.find((s) => {
          if (where.id && s.id !== where.id) return false;
          if (where.orderId && s.orderId !== where.orderId) return false;
          if (where.businessId && s.businessId !== where.businessId) return false;
          return true;
        });
        if (!s) throw new Error('Shipment not found');
        return s;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const newShipment: MockShipment = {
          id: `ship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          businessId: data.businessId as string,
          orderId: data.orderId as string,
          method: (data.method as ShipMethod) || ShipMethod.OWN_FLEET,
          transporterId: (data.transporterId as string) || null,
          trackingNo: (data.trackingNo as string) || null,
          driverName: (data.driverName as string) || null,
          vehiclePlate: (data.vehiclePlate as string) || null,
          receiverName: (data.receiverName as string) || null,
          status: (data.status as ShipStatus) || ShipStatus.PREPARING,
          deliveryNo: (data.deliveryNo as string) || null,
          actualCost: (data.actualCost as bigint) || BigInt(0),
          shippedAt: (data.shippedAt as Date) || null,
          deliveredAt: (data.deliveredAt as Date) || null,
          notes: (data.notes as string) || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        shipments.push(newShipment);
        return newShipment;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (let i = 0; i < shipments.length; i++) {
          if (where.id && shipments[i].id !== where.id) continue;
          if (where.businessId && shipments[i].businessId !== where.businessId) continue;
          shipments[i] = { ...shipments[i], ...data, updatedAt: new Date() };
          count++;
        }
        return { count };
      }),
    },
    user: {
      findMany: vi.fn(async () => [{ id: 'sa_1' }]),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return { id: `audit_${Date.now()}`, ...data };
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        return { id: `notif_${Date.now()}`, ...data };
      }),
    },
    $queryRaw: vi.fn(async () => [{ id: 'locked' }]),
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
  };

  return { prisma: mockPrisma };
});

describe('T3.4: Pelunasan dan Pengiriman (Shipment, Request Final, Void Invoice)', () => {
  const adminCtx: Ctx = {
    user: { id: 'sa_1', role: Role.SUPERADMIN, name: 'Owner', businessId: null },
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    sessionId: 'sess_admin',
    ip: '127.0.0.1',
  };

  const salesCtx: Ctx = {
    user: { id: 'sales_1', role: Role.SALES, name: 'Sales One', businessId: 'biz_1' },
    role: Role.SALES,
    businessId: 'biz_1',
    sessionId: 'sess_sales_1',
    ip: '127.0.0.1',
  };

  const sales2Ctx: Ctx = {
    user: { id: 'sales_2', role: Role.SALES, name: 'Sales Two', businessId: 'biz_1' },
    role: Role.SALES,
    businessId: 'biz_1',
    sessionId: 'sess_sales_2',
    ip: '127.0.0.1',
  };

  const APP_URL = 'http://localhost:3000';
  let tx: TxClient;

  beforeEach(async () => {
    tx = (await import('@/lib/db')).prisma as unknown as TxClient;
    businesses = [
      {
        id: 'biz_1',
        name: 'Usaha Maju Bersama',
        enablePpn: true,
        ppnRateBps: 1100,
        requirePaidBeforeShip: false,
      },
    ];

    customers = [
      {
        id: 'cust_1',
        businessId: 'biz_1',
        code: 'TEROBOS',
        name: 'PT Terobos Jaya',
        deletedAt: null,
      },
    ];

    products = [
      {
        id: 'prod_1',
        businessId: 'biz_1',
        name: 'Bento Box Premium',
        stockQty: 100,
        reservedQty: 10,
      },
    ];

    orders = [];
    orderItems = [];
    invoices = [];
    payments = [];
    shipments = [];
    auditLogs = [];
    notifications = [];

    vi.spyOn(contextModule, 'requireContext').mockImplementation(async () => adminCtx);
  });

  describe('1. Pengajuan Faktur Pelunasan (requestFinalOrder)', () => {
    it('menolak pengajuan jika status order bukan IN_PROCESS (409 INVALID_STATE)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.DRAFT,
        version: 1,
        rev: 0,
        orderNo: null,
        customerSeq: null,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        stockReserved: false,
        rejectReason: null,
        deletedAt: null,
      });

      await expect(requestFinalOrder(tx, salesCtx, 'ord_1')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_STATE', status: 409 })
      );
    });

    it('menolak pengajuan jika DP belum lunas (409 INVALID_STATE)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(100000), // Belum lunas DP
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_dp_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(287500),
        paidAmount: BigInt(100000),
        notes: null,
        deletedAt: null,
      });

      await expect(requestFinalOrder(tx, salesCtx, 'ord_1')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_STATE', status: 409 })
      );
    });

    it('menolak pengajuan jika ada invoice lain yang sedang PENDING_APPROVAL (409 INVOICE_ALREADY_PENDING)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_dp_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(287500),
        paidAmount: BigInt(287500),
        notes: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_pending_final',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.FINAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        version: 1,
        number: null,
        amount: BigInt(287500),
        paidAmount: BigInt(0),
        notes: null,
        deletedAt: null,
      });

      await expect(requestFinalOrder(tx, salesCtx, 'ord_1')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVOICE_ALREADY_PENDING', status: 409 })
      );
    });

    it('menolak staf sales lain yang mencoba request-final (403 FORBIDDEN)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      await expect(requestFinalOrder(tx, sales2Ctx, 'ord_1')).rejects.toThrowError(
        expect.objectContaining({ code: 'FORBIDDEN', status: 403 })
      );
    });

    it('memvalidasi alasan perubahan ongkir minimal 5 karakter bila ongkir berubah (422 SHIPPING_REASON_REQUIRED)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_dp_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(287500),
        paidAmount: BigInt(287500),
        notes: null,
        deletedAt: null,
      });

      // Mengubah ongkir dari 20.000 ke 35.000 tanpa alasan
      await expect(
        requestFinalOrder(tx, salesCtx, 'ord_1', {
          shippingCharge: 35000,
          shippingReason: 'kur', // Kurang dari 5 karakter
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'SHIPPING_REASON_REQUIRED', status: 422 })
      );
    });

    it('berhasil mengajukan faktur pelunasan: membuat invoice FINAL PENDING_APPROVAL dan transisi status order ke FINAL_PENDING_APPROVAL', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      orderItems.push({
        id: 'item_1',
        orderId: 'ord_1',
        productId: 'prod_1',
        qty: 10,
        unitPrice: BigInt(50000),
        lineSubtotal: BigInt(500000),
        discountType: null,
        discountValue: null,
      });

      invoices.push({
        id: 'inv_dp_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(287500),
        paidAmount: BigInt(287500),
        notes: null,
        deletedAt: null,
      });

      const res = await requestFinalOrder(tx, salesCtx, 'ord_1');

      expect(res.order.status).toBe(OrderStatus.FINAL_PENDING_APPROVAL);
      expect(res.invoice.type).toBe(InvoiceType.FINAL);
      expect(res.invoice.amount).toBe(287500); // 575.000 - 287.500
      expect(res.invoice.status).toBe(InvoiceStatus.PENDING_APPROVAL);

      const targetOrder = orders.find((o) => o.id === 'ord_1');
      expect(targetOrder?.status).toBe(OrderStatus.FINAL_PENDING_APPROVAL);
    });

    it('menarik pengajuan dari FINAL_PENDING_APPROVAL mengembalikan order ke IN_PROCESS', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.FINAL_PENDING_APPROVAL,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_final_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.FINAL,
        status: InvoiceStatus.PENDING_APPROVAL,
        version: 1,
        number: null,
        amount: BigInt(287500),
        paidAmount: BigInt(0),
        notes: null,
        deletedAt: null,
      });

      const withdrawRes = await withdrawOrder(tx, salesCtx, 'ord_1');
      expect(withdrawRes.order.status).toBe(OrderStatus.IN_PROCESS);

      const inv = invoices.find((i) => i.id === 'inv_final_1');
      expect(inv?.status).toBe(InvoiceStatus.WITHDRAWN);
    });
  });

  describe('2. Pembatalan Faktur Resmi (voidInvoice)', () => {
    it('menolak Sales yang mencoba membatalkan faktur (403 FORBIDDEN)', async () => {
      await expect(
        voidInvoice(tx, salesCtx, 'inv_1', { reason: 'Dibatalkan oleh pelanggan' })
      ).rejects.toThrowError(expect.objectContaining({ code: 'FORBIDDEN', status: 403 }));
    });

    it('memvalidasi alasan void minimal 5 karakter (422 VOID_REASON_REQUIRED)', async () => {
      await expect(
        voidInvoice(tx, adminCtx, 'inv_1', { reason: '   btl   ' })
      ).rejects.toThrowError(expect.objectContaining({ code: 'VOID_REASON_REQUIRED', status: 422 }));
    });

    it('menolak void faktur yang memiliki pembayaran terverifikasi (409 HAS_VERIFIED_PAYMENTS)', async () => {
      invoices.push({
        id: 'inv_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(250000),
        paidAmount: BigInt(250000),
        notes: null,
        deletedAt: null,
      });

      payments.push({
        id: 'pay_1',
        invoiceId: 'inv_1',
        businessId: 'biz_1',
        status: PaymentStatus.VERIFIED,
      });

      await expect(
        voidInvoice(tx, adminCtx, 'inv_1', { reason: 'Pembatalan faktur uang muka' })
      ).rejects.toThrowError(expect.objectContaining({ code: 'HAS_VERIFIED_PAYMENTS', status: 409 }));
    });

    it('void faktur DP pertama: melepas reservasi stok, order kembali ke REVISION_REQUIRED dan version bertambah', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.AWAITING_DP,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      orderItems.push({
        id: 'item_1',
        orderId: 'ord_1',
        productId: 'prod_1',
        qty: 10,
        unitPrice: BigInt(50000),
        lineSubtotal: BigInt(500000),
        discountType: null,
        discountValue: null,
      });

      invoices.push({
        id: 'inv_dp_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(287500),
        paidAmount: BigInt(0),
        notes: null,
        deletedAt: null,
      });

      const res = await voidInvoice(tx, adminCtx, 'inv_dp_1', {
        reason: 'Customer membatalkan kesepakatan uang muka awal',
      });

      expect(res.order.status).toBe(OrderStatus.REVISION_REQUIRED);
      expect(res.order.version).toBe(2);
      expect(res.invoice.status).toBe(InvoiceStatus.VOID);

      const targetOrder = orders.find((o) => o.id === 'ord_1');
      expect(targetOrder?.stockReserved).toBe(false);
      expect(products[0].reservedQty).toBe(0); // 10 dikurangi 10
    });
  });

  describe('3. Manajemen Pengiriman (upsertShipment)', () => {
    it('menolak Sales yang mengirim field actualCost (422 UNPROCESSABLE_ENTITY)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      await expect(
        upsertShipment(tx, salesCtx, 'ord_1', {
          method: ShipMethod.EXPEDITION,
          actualCost: 15000,
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'UNPROCESSABLE_ENTITY', status: 422 })
      );
    });

    it('Super Admin dapat menyimpan actualCost dan melihatnya di DTO, sedangkan Sales tidak menerima actualCost', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      const adminShip = await upsertShipment(tx, adminCtx, 'ord_1', {
        method: ShipMethod.EXPEDITION,
        trackingNo: 'RESI-123456',
        actualCost: 18000,
      });

      expect(adminShip.actualCost).toBe(18000);
      expect(adminShip.trackingNo).toBe('RESI-123456');

      const salesShip = await getShipment(tx, salesCtx, 'ord_1');
      expect(salesShip).not.toBeNull();
      expect(salesShip?.actualCost).toBeUndefined(); // Privasi terjamin
      expect(salesShip?.trackingNo).toBe('RESI-123456');
    });
  });

  describe('4. Pelaksanaan Pengiriman (shipOrder & deliverOrder)', () => {
    it('menolak pengiriman barang jika status order belum AWAITING_FINAL_PAYMENT (409 INVALID_STATE)', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS, // Belum AWAITING_FINAL_PAYMENT
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      await expect(shipOrder(tx, salesCtx, 'ord_1')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_STATE', status: 409 })
      );
    });

    it('menolak pengiriman barang bila requirePaidBeforeShip aktif dan sisa tagihan > 0 (409 PAYMENT_REQUIRED)', async () => {
      businesses[0].requirePaidBeforeShip = true;

      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500), // Sisa tagihan 287.500
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      await expect(shipOrder(tx, salesCtx, 'ord_1')).rejects.toThrowError(
        expect.objectContaining({ code: 'PAYMENT_REQUIRED', status: 409 })
      );
    });

    it('berhasil menandai SHIPPED: mengalokasikan nomor surat jalan, memotong stok fisik keluar, dan mengupdate status shipment', async () => {
      businesses[0].requirePaidBeforeShip = false; // Boleh kirim sebelum pelunasan

      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      orderItems.push({
        id: 'item_1',
        orderId: 'ord_1',
        productId: 'prod_1',
        qty: 10,
        unitPrice: BigInt(50000),
        lineSubtotal: BigInt(500000),
        discountType: null,
        discountValue: null,
      });

      products[0].stockQty = 100;
      products[0].reservedQty = 10;

      const res = await shipOrder(tx, salesCtx, 'ord_1');

      expect(res.status).toBe(ShipStatus.SHIPPED);
      expect(res.deliveryNo).toMatch(/^TEROBOS\/SJ\/\d{2}\/\d{2}\/\d{4}\/0001$/);
      expect(res.shippedAt).not.toBeNull();

      // Stok fisik berkurang dari 100 menjadi 90, reserved berkurang dari 10 menjadi 0
      expect(products[0].stockQty).toBe(90);
      expect(products[0].reservedQty).toBe(0);
      expect(orders[0].stockReserved).toBe(false);
    });

    it('berhasil menandai DELIVERED: status pengiriman menjadi DELIVERED dan memicu maybeComplete jika sudah lunas', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(575000), // Sudah lunas!
        creditTotal: BigInt(0),
        stockReserved: false,
        rejectReason: null,
        deletedAt: null,
      });

      shipments.push({
        id: 'ship_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        method: ShipMethod.OWN_FLEET,
        transporterId: null,
        trackingNo: null,
        driverName: 'Pak Joko',
        vehiclePlate: 'B 1234 CD',
        receiverName: null,
        status: ShipStatus.SHIPPED,
        deliveryNo: 'TEROBOS/SJ/05/11/2026/0001',
        actualCost: BigInt(0),
        shippedAt: new Date(),
        deliveredAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await deliverOrder(tx, salesCtx, 'ord_1', {
        receiverName: 'Ibu Ratna',
      });

      expect(res.status).toBe(ShipStatus.DELIVERED);
      expect(res.deliveredAt).not.toBeNull();
      expect(res.receiverName).toBe('Ibu Ratna');

      // Evaluasi maybeComplete: pesanan otomatis COMPLETED karena lunas dan terkirim!
      expect(orders[0].status).toBe(OrderStatus.COMPLETED);
    });
  });

  describe('5. Route Handlers API Integration', () => {
    it('POST /api/v1/orders/:id/request-final melayani permintaan pelunasan', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sa_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 1,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      orderItems.push({
        id: 'item_1',
        orderId: 'ord_1',
        productId: 'prod_1',
        qty: 10,
        unitPrice: BigInt(50000),
        lineSubtotal: BigInt(500000),
        discountType: null,
        discountValue: null,
      });

      invoices.push({
        id: 'inv_dp_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-DP',
        amount: BigInt(287500),
        paidAmount: BigInt(287500),
        notes: null,
        deletedAt: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/orders/ord_1/request-final', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: APP_URL,
        },
        body: JSON.stringify({}),
      });

      const res = await requestFinalHandler(req, { params: Promise.resolve({ id: 'ord_1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.order.status).toBe(OrderStatus.FINAL_PENDING_APPROVAL);
      expect(json.data.invoice.type).toBe(InvoiceType.FINAL);
    });

    it('POST /api/v1/invoices/:id/void melayani pembatalan faktur', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sales_1',
        status: OrderStatus.IN_PROCESS,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      invoices.push({
        id: 'inv_final_1',
        businessId: 'biz_1',
        orderId: 'ord_1',
        type: InvoiceType.FINAL,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: 'TEROBOS/INV/05/11/2026/0001-LNS',
        amount: BigInt(287500),
        paidAmount: BigInt(0),
        notes: null,
        deletedAt: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/invoices/inv_final_1/void', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: APP_URL,
        },
        body: JSON.stringify({ reason: 'Faktur pelunasan salah hitung pajak' }),
      });

      const res = await voidInvoiceHandler(req, { params: Promise.resolve({ id: 'inv_final_1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.invoice.status).toBe(InvoiceStatus.VOID);
      expect(json.data.order.status).toBe(OrderStatus.IN_PROCESS);
    });

    it('GET & POST /api/v1/orders/:id/shipment melayani pembuatan dan detail pengiriman', async () => {
      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sa_1',
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(287500),
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      const postReq = new NextRequest('http://localhost:3000/api/v1/orders/ord_1/shipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: APP_URL,
        },
        body: JSON.stringify({
          method: ShipMethod.EXPEDITION,
          trackingNo: 'JNE-999888',
          notes: 'Kirim pagi',
        }),
      });

      const postRes = await upsertShipmentHandler(postReq, { params: Promise.resolve({ id: 'ord_1' }) });
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.data.trackingNo).toBe('JNE-999888');

      const getReq = new NextRequest('http://localhost:3000/api/v1/orders/ord_1/shipment', {
        method: 'GET',
      });

      const getRes = await getShipmentHandler(getReq, { params: Promise.resolve({ id: 'ord_1' }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.data.trackingNo).toBe('JNE-999888');
    });

    it('POST /api/v1/orders/:id/shipment/ship dan deliver melayani siklus hidup pengiriman lengkap', async () => {
      businesses[0].requirePaidBeforeShip = false;

      orders.push({
        id: 'ord_1',
        businessId: 'biz_1',
        customerId: 'cust_1',
        salesId: 'sa_1',
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        version: 1,
        rev: 2,
        orderNo: 'TEROBOS/INV/05/11/2026/0001',
        customerSeq: 1,
        shippingCharge: BigInt(20000),
        shippingReason: null,
        subtotal: BigInt(500000),
        ppnAmount: BigInt(55000),
        grandTotal: BigInt(575000),
        dpAmount: BigInt(287500),
        paidTotal: BigInt(575000), // Lunas
        creditTotal: BigInt(0),
        stockReserved: true,
        rejectReason: null,
        deletedAt: null,
      });

      orderItems.push({
        id: 'item_1',
        orderId: 'ord_1',
        productId: 'prod_1',
        qty: 10,
        unitPrice: BigInt(50000),
        lineSubtotal: BigInt(500000),
        discountType: null,
        discountValue: null,
      });

      const shipReq = new NextRequest('http://localhost:3000/api/v1/orders/ord_1/shipment/ship', {
        method: 'POST',
        headers: {
          origin: APP_URL,
        },
      });

      const shipRes = await shipOrderHandler(shipReq, { params: Promise.resolve({ id: 'ord_1' }) });
      expect(shipRes.status).toBe(200);
      const shipJson = await shipRes.json();
      expect(shipJson.data.status).toBe(ShipStatus.SHIPPED);
      expect(shipJson.data.deliveryNo).toContain('TEROBOS/SJ');

      const deliverReq = new NextRequest('http://localhost:3000/api/v1/orders/ord_1/shipment/deliver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: APP_URL,
        },
        body: JSON.stringify({ receiverName: 'Bapak Direktur' }),
      });

      const deliverRes = await deliverOrderHandler(deliverReq, { params: Promise.resolve({ id: 'ord_1' }) });
      expect(deliverRes.status).toBe(200);
      const deliverJson = await deliverRes.json();
      expect(deliverJson.data.status).toBe(ShipStatus.DELIVERED);
      expect(deliverJson.data.receiverName).toBe('Bapak Direktur');

      // Order otomatis COMPLETED
      expect(orders[0].status).toBe(OrderStatus.COMPLETED);
    });
  });
});
