import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  Role,
  OrderStatus,
  ShipStatus,
  CreditSettlement,
  StockMoveType,
  PaymentType,
  PaymentStatus,
} from '@prisma/client';
import * as contextModule from '@/lib/auth/context';
import { assertNoSecretKeys } from '../helpers/leak';
import {
  POST as createCreditNoteHandler,
  GET as getOrderCreditNotesHandler,
} from '@/app/api/v1/orders/[id]/credit-notes/route';
import { GET as listCreditNotesHandler } from '@/app/api/v1/credit-notes/route';
import { GET as getCreditNoteDetailHandler } from '@/app/api/v1/credit-notes/[id]/route';
import { POST as voidCreditNoteHandler } from '@/app/api/v1/credit-notes/[id]/void/route';
import { GET as getCustomerCreditBalanceHandler } from '@/app/api/v1/customers/[id]/credit-balance/route';

interface MockBusiness {
  id: string;
  name: string;
  deletedAt: Date | null;
}

interface MockCustomer {
  id: string;
  businessId: string;
  [key: string]: unknown;
}

interface MockOrder {
  id: string;
  businessId: string;
  customerId: string;
  salesId: string;
  status: OrderStatus;
  grandTotal: bigint;
  paidTotal: bigint;
  creditTotal: bigint;
  rev?: number;
  deletedAt: Date | null;
  [key: string]: unknown;
}

interface MockOrderItem {
  id: string;
  orderId: string;
  [key: string]: unknown;
}

interface MockShipment {
  id: string;
  orderId: string;
  businessId: string;
  status: ShipStatus;
  deliveryNo: string;
}

interface MockCreditNoteItem {
  id: string;
  creditNoteId: string;
  orderItemId: string;
  qty: number;
  creditAmount: bigint;
  restock: boolean;
  costReversed?: bigint;
  [key: string]: unknown;
}

interface MockCreditNote {
  id: string;
  businessId: string;
  orderId: string;
  customerId: string;
  number: string;
  reason: string;
  settlement: CreditSettlement;
  amountExPpn?: bigint;
  ppnAmount?: bigint;
  total: bigint;
  cogsReversed?: bigint;
  createdById?: string;
  createdAt?: Date;
  voidedAt: Date | null;
  items?: MockCreditNoteItem[];
  [key: string]: unknown;
}

interface MockCustomerCreditEntry {
  id: string;
  businessId: string;
  customerId: string;
  amount: bigint;
  createdAt: Date;
  [key: string]: unknown;
}

interface MockPayment {
  id: string;
  orderId?: string;
  reference?: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: bigint;
  notes?: string;
  createdAt: Date;
  [key: string]: unknown;
}

interface MockProduct {
  id: string;
  stockQty: number;
  [key: string]: unknown;
}

interface MockStockMovement {
  type: StockMoveType;
  qtyDelta: number;
  [key: string]: unknown;
}

interface MockAuditLog {
  action: string;
  [key: string]: unknown;
}

// Mocks
const mockBusinesses: MockBusiness[] = [];
const mockCustomers: MockCustomer[] = [];
const mockOrders: MockOrder[] = [];
const mockOrderItems: MockOrderItem[] = [];
const mockShipments: MockShipment[] = [];
const mockCreditNotes: MockCreditNote[] = [];
const mockCreditNoteItems: MockCreditNoteItem[] = [];
const mockCustomerCreditEntries: MockCustomerCreditEntry[] = [];
const mockPayments: MockPayment[] = [];
const mockStockMovements: MockStockMovement[] = [];
const mockProducts: MockProduct[] = [];
const mockAuditLogs: MockAuditLog[] = [];
const mockNotifications: Record<string, unknown>[] = [];

let counterSeq = 1;

interface OrderWhere {
  id?: string | { in?: string[] };
  businessId?: string;
  salesId?: string;
  deletedAt?: Date | null;
}

interface CreditNoteWhere {
  id?: string;
  orderId?: string | { in?: string[] };
  businessId?: string;
  voidedAt?: Date | null;
  settlement?: CreditSettlement;
}

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        order: {
          findFirst: vi.fn(async ({ where }: { where: OrderWhere }) => {
            const found = mockOrders.find((o) => {
              if (where.id && o.id !== where.id) return false;
              if (where.businessId && o.businessId !== where.businessId) return false;
              if (where.deletedAt === null && o.deletedAt !== null) return false;
              return true;
            });
            if (!found) return null;
            const customer = mockCustomers.find((c) => c.id === found.customerId);
            const items = mockOrderItems.filter((i) => i.orderId === found.id);
            return { ...found, customer, items };
          }),
          findMany: vi.fn(async ({ where }: { where: OrderWhere }) => {
            const res = mockOrders.filter((o) => {
              if (where.businessId && o.businessId !== where.businessId) return false;
              if (where.salesId && o.salesId !== where.salesId) return false;
              if (typeof where.id === 'object' && where.id?.in && !where.id.in.includes(o.id)) return false;
              if (where.deletedAt === null && o.deletedAt !== null) return false;
              return true;
            });
            return res;
          }),
          updateMany: vi.fn(async ({ where, data }: { where: { id?: string; businessId?: string }; data: { creditTotal?: { increment?: bigint; decrement?: bigint }; status?: OrderStatus; rev?: { increment?: number } } }) => {
            let count = 0;
            mockOrders.forEach((o) => {
              if (where.id && o.id !== where.id) return;
              if (where.businessId && o.businessId !== where.businessId) return;
              if (data.creditTotal?.increment) {
                o.creditTotal = (o.creditTotal || BigInt(0)) + data.creditTotal.increment;
              } else if (data.creditTotal?.decrement) {
                o.creditTotal = (o.creditTotal || BigInt(0)) - data.creditTotal.decrement;
              }
              if (data.status) {
                o.status = data.status;
              }
              if (data.rev?.increment) {
                o.rev = (o.rev || 0) + data.rev.increment;
              }
              count++;
            });
            return { count };
          }),
        },
        orderItem: {
          findMany: vi.fn(async ({ where }: { where: { id?: { in?: string[] }; orderId?: { in?: string[] } } }) => {
            return mockOrderItems.filter((i) => {
              if (where.id?.in && !where.id.in.includes(i.id)) return false;
              if (where.orderId?.in && !where.orderId.in.includes(i.orderId)) return false;
              return true;
            });
          }),
        },
        customer: {
          findFirst: vi.fn(async ({ where }: { where: { id?: string; businessId?: string } }) => {
            return mockCustomers.find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.businessId && c.businessId !== where.businessId) return false;
              return true;
            }) || null;
          }),
          findMany: vi.fn(async ({ where }: { where: { businessId?: string } }) => {
            return mockCustomers.filter((c) => {
              if (where.businessId && c.businessId !== where.businessId) return false;
              return true;
            });
          }),
        },
        shipment: {
          findFirst: vi.fn(async ({ where }: { where: { orderId?: string; businessId?: string } }) => {
            return mockShipments.find((s) => {
              if (where.orderId && s.orderId !== where.orderId) return false;
              if (where.businessId && s.businessId !== where.businessId) return false;
              return true;
            }) || null;
          }),
        },
        creditNote: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> & { items?: { create?: Array<Record<string, unknown>> } } }) => {
            const id = `cn_${mockCreditNotes.length + 1}`;
            const itemsData = (data.items?.create || []).map((it, idx) => ({
              id: `cni_${mockCreditNoteItems.length + idx + 1}`,
              creditNoteId: id,
              ...it,
            })) as MockCreditNoteItem[];
            const created = {
              id,
              ...data,
              items: itemsData,
            } as MockCreditNote;
            mockCreditNotes.push(created);
            itemsData.forEach((it) => mockCreditNoteItems.push(it));
            return created;
          }),
          findFirst: vi.fn(async ({ where }: { where: CreditNoteWhere }) => {
            const found = mockCreditNotes.find((cn) => {
              if (where.id && cn.id !== where.id) return false;
              if (where.businessId && cn.businessId !== where.businessId) return false;
              return true;
            });
            if (!found) return null;
            const items = mockCreditNoteItems.filter((i) => i.creditNoteId === found.id);
            return { ...found, items };
          }),
          findFirstOrThrow: vi.fn(async ({ where }: { where: CreditNoteWhere }) => {
            const found = mockCreditNotes.find((cn) => {
              if (where.id && cn.id !== where.id) return false;
              if (where.businessId && cn.businessId !== where.businessId) return false;
              return true;
            });
            if (!found) throw new Error('Not found');
            const items = mockCreditNoteItems.filter((i) => i.creditNoteId === found.id);
            return { ...found, items };
          }),
          findMany: vi.fn(async ({ where }: { where: CreditNoteWhere }) => {
            const res = mockCreditNotes.filter((cn) => {
              if (where.orderId && typeof where.orderId === 'string' && cn.orderId !== where.orderId) return false;
              if (typeof where.orderId === 'object' && where.orderId?.in && !where.orderId.in.includes(cn.orderId)) return false;
              if (where.businessId && cn.businessId !== where.businessId) return false;
              if (where.voidedAt === null && cn.voidedAt !== null) return false;
              if (where.settlement && cn.settlement !== where.settlement) return false;
              return true;
            });
            return res.map((cn) => {
              const items = mockCreditNoteItems.filter((i) => i.creditNoteId === cn.id);
              return { ...cn, items };
            });
          }),
          count: vi.fn(async ({ where }: { where: CreditNoteWhere }) => {
            return mockCreditNotes.filter((cn) => {
              if (where.orderId && typeof where.orderId === 'string' && cn.orderId !== where.orderId) return false;
              if (where.businessId && cn.businessId !== where.businessId) return false;
              return true;
            }).length;
          }),
          updateMany: vi.fn(async ({ where, data }: { where: CreditNoteWhere; data: { voidedAt?: Date | null } }) => {
            let count = 0;
            mockCreditNotes.forEach((cn) => {
              if (where.id && cn.id !== where.id) return;
              if (where.businessId && cn.businessId !== where.businessId) return;
              if (data.voidedAt !== undefined) cn.voidedAt = data.voidedAt;
              count++;
            });
            return { count };
          }),
        },
        customerCreditEntry: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const id = `cce_${mockCustomerCreditEntries.length + 1}`;
            const entry = { id, createdAt: new Date(), ...data } as MockCustomerCreditEntry;
            mockCustomerCreditEntries.push(entry);
            return entry;
          }),
          findMany: vi.fn(async ({ where }: { where: { customerId?: string; businessId?: string } }) => {
            return mockCustomerCreditEntries.filter((e) => {
              if (where.customerId && e.customerId !== where.customerId) return false;
              if (where.businessId && e.businessId !== where.businessId) return false;
              return true;
            });
          }),
        },
        payment: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const id = `pay_${mockPayments.length + 1}`;
            const pay = { id, createdAt: new Date(), ...data } as MockPayment;
            mockPayments.push(pay);
            return pay;
          }),
          findFirst: vi.fn(async ({ where }: { where: { orderId?: string; reference?: string; type?: PaymentType; status?: PaymentStatus } }) => {
            return mockPayments.find((p) => {
              if (where.orderId && p.orderId !== where.orderId) return false;
              if (where.reference && p.reference !== where.reference) return false;
              if (where.type && p.type !== where.type) return false;
              if (where.status && p.status !== where.status) return false;
              return true;
            }) || null;
          }),
          findMany: vi.fn(async ({ where }: { where: { orderId?: string; status?: PaymentStatus } }) => {
            return mockPayments.filter((p) => {
              if (where.orderId && p.orderId !== where.orderId) return false;
              if (where.status && p.status !== where.status) return false;
              return true;
            });
          }),
          updateMany: vi.fn(async ({ where, data }: { where: { id?: string }; data: { status?: PaymentStatus; notes?: string } }) => {
            let count = 0;
            mockPayments.forEach((p) => {
              if (where.id && p.id !== where.id) return;
              if (data.status) p.status = data.status;
              if (data.notes) p.notes = data.notes;
              count++;
            });
            return { count };
          }),
        },
        product: {
          updateMany: vi.fn(async ({ where, data }: { where: { id?: string }; data: { stockQty?: { increment?: number } } }) => {
            mockProducts.forEach((p) => {
              if (where.id && p.id !== where.id) return;
              if (data.stockQty?.increment) {
                p.stockQty = (p.stockQty || 0) + data.stockQty.increment;
              }
            });
            return { count: 1 };
          }),
          findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => {
            return mockProducts.find((p) => p.id === where.id) || null;
          }),
        },
        stockMovement: {
          create: vi.fn(async ({ data }: { data: MockStockMovement }) => {
            mockStockMovements.push(data);
            return data;
          }),
        },
        auditLog: {
          create: vi.fn(async ({ data }: { data: MockAuditLog }) => {
            mockAuditLogs.push(data);
            return data;
          }),
        },
        notification: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            mockNotifications.push(data);
            return data;
          }),
        },
        invoice: {
          findMany: vi.fn(async () => []),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        $queryRaw: vi.fn(async () => {
          return [{ lastSeq: counterSeq++ }];
        }),
      };
      return callback(tx);
    }),
  },
}));

vi.mock('@/lib/services/counter', () => ({
  allocateCustomerCreditNoteSeq: vi.fn(async () => counterSeq++),
}));

describe('T3.6: Retur Penjualan dan Nota Kredit (Credit Note)', () => {
  const BIZ_ID = 'biz_retur_01';
  const SALES_ID_1 = 'sales_usr_01';
  const SALES_ID_2 = 'sales_usr_02';

  const superAdminCtx: contextModule.Ctx = {
    user: { id: 'sa_usr_01', role: Role.SUPERADMIN, name: 'Owner Utama', businessId: BIZ_ID },
    role: Role.SUPERADMIN,
    businessId: BIZ_ID,
    sessionId: 'sess_sa_01',
    ip: '127.0.0.1',
  };

  const sales1Ctx: contextModule.Ctx = {
    user: { id: SALES_ID_1, role: Role.SALES, name: 'Budi Sales', businessId: BIZ_ID },
    role: Role.SALES,
    businessId: BIZ_ID,
    sessionId: 'sess_s1_01',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    mockBusinesses.length = 0;
    mockCustomers.length = 0;
    mockOrders.length = 0;
    mockOrderItems.length = 0;
    mockShipments.length = 0;
    mockCreditNotes.length = 0;
    mockCreditNoteItems.length = 0;
    mockCustomerCreditEntries.length = 0;
    mockPayments.length = 0;
    mockStockMovements.length = 0;
    mockProducts.length = 0;
    mockAuditLogs.length = 0;
    mockNotifications.length = 0;
    counterSeq = 1;
    vi.clearAllMocks();

    const business = {
      id: BIZ_ID,
      name: 'PT BentoCat Distribusi',
      deletedAt: null,
    };
    mockBusinesses.push(business);

    const customer = {
      id: 'cust_01',
      businessId: BIZ_ID,
      code: 'CUST-001',
      name: 'Toko Berkah Abadi',
      assignedSalesId: SALES_ID_1,
      deletedAt: null,
    };
    mockCustomers.push(customer);

    const product1 = {
      id: 'prod_01',
      businessId: BIZ_ID,
      sku: 'BRS-10KG',
      name: 'Beras Ramos 10kg',
      stockQty: 100,
    };
    const product2 = {
      id: 'prod_02',
      businessId: BIZ_ID,
      sku: 'MYK-2L',
      name: 'Minyak Goreng 2L',
      stockQty: 50,
    };
    mockProducts.push(product1, product2);

    // Order 1: Status AWAITING_FINAL_PAYMENT, Shipment SHIPPED, grandTotal 1.000.000, paidTotal 300.000, creditTotal 0 (balanceDue = 700.000)
    const order1 = {
      id: 'ord_shipped_1',
      businessId: BIZ_ID,
      customerId: 'cust_01',
      salesId: SALES_ID_1,
      orderNo: 'ORD-2026-04-001',
      status: OrderStatus.AWAITING_FINAL_PAYMENT,
      grandTotal: BigInt(1000000),
      paidTotal: BigInt(300000),
      creditTotal: BigInt(0),
      ppnEnabled: false,
      ppnRateBps: 0,
      rev: 1,
      deletedAt: null,
    };
    mockOrders.push(order1);

    mockOrderItems.push(
      {
        id: 'oi_01',
        orderId: 'ord_shipped_1',
        productId: 'prod_01',
        productName: 'Beras Ramos 10kg',
        sku: 'BRS-10KG',
        unit: 'sak',
        qty: 10,
        unitPrice: BigInt(70000),
        lineNet: BigInt(700000),
        costPrice: BigInt(50000),
      },
      {
        id: 'oi_02',
        orderId: 'ord_shipped_1',
        productId: 'prod_02',
        productName: 'Minyak Goreng 2L',
        sku: 'MYK-2L',
        unit: 'pouch',
        qty: 10,
        unitPrice: BigInt(30000),
        lineNet: BigInt(300000),
        costPrice: BigInt(22000),
      }
    );

    mockShipments.push({
      id: 'ship_01',
      orderId: 'ord_shipped_1',
      businessId: BIZ_ID,
      status: ShipStatus.SHIPPED,
      deliveryNo: 'SJ/2026/04/0001',
    });
  });

  describe('1. Validasi Pembuatan Retur & Nota Kredit', () => {
    it('menolak pembuatan retur jika pesanan belum dikirim (409 INVALID_STATE)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      // Buat order draft
      mockOrders.push({
        id: 'ord_draft_1',
        businessId: BIZ_ID,
        customerId: 'cust_01',
        salesId: SALES_ID_1,
        status: OrderStatus.DRAFT,
        grandTotal: BigInt(500000),
        paidTotal: BigInt(0),
        creditTotal: BigInt(0),
        deletedAt: null,
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_draft_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Barang kemasan robek',
            settlement: CreditSettlement.OFFSET,
            items: [{ orderItemId: 'oi_01', qty: 2, restock: true }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_draft_1' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_STATE');
    });

    it('menolak jika jumlah barang yang diretur melebihi pesanan (422 RETURN_QTY_INVALID)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Kemasan rusak saat pengiriman',
            settlement: CreditSettlement.OFFSET,
            items: [{ orderItemId: 'oi_01', qty: 15, restock: true }], // order hanya 10
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe('RETURN_QTY_INVALID');
    });

    it('Sales ditolak 403 jika mencoba membuat retur pesanan Sales lain', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce({
        ...sales1Ctx,
        user: { ...sales1Ctx.user, id: SALES_ID_2 },
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Barang tidak sesuai',
            settlement: CreditSettlement.OFFSET,
            items: [{ orderItemId: 'oi_01', qty: 1, restock: true }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Penerbitan Credit Note dengan Penyelesaian OFFSET', () => {
    it('berhasil memotong tagihan pesanan, mengalokasikan nomor atomik, dan menambah stok fisik gudang (restock)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      // Retur 2 sak Beras Ramos @ 70.000 = 140.000
      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Kemasan sobek 2 sak terkena palet basah',
            settlement: CreditSettlement.OFFSET,
            items: [{ orderItemId: 'oi_01', qty: 2, restock: true }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const cn = json.data;
      expect(cn.settlement).toBe('OFFSET');
      expect(cn.total).toBe(140000);
      expect(cn.number).toContain('/CN/');
      expect(cn.cogsReversed).toBe(100000); // 2 x 50.000 (Super Admin melihat cogs)

      // Memastikan order.creditTotal bertambah
      const order = mockOrders.find((o) => o.id === 'ord_shipped_1');
      expect(order?.creditTotal).toBe(BigInt(140000));

      // Memastikan stok fisik bertambah (StockMoveType.RETURN_IN)
      expect(mockStockMovements).toHaveLength(1);
      expect(mockStockMovements[0].type).toBe(StockMoveType.RETURN_IN);
      expect(mockStockMovements[0].qtyDelta).toBe(2);

      // Memastikan AuditLog tercatat
      expect(mockAuditLogs.some((a) => a.action === 'CREDIT_NOTE_CREATE')).toBe(true);
    });

    it('menolak retur jika barang tanpa restock (restock = false) tidak mencatat penambahan stok fisik', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Minyak bocor habis tidak bisa dipakai lagi',
            settlement: CreditSettlement.OFFSET,
            items: [{ orderItemId: 'oi_02', qty: 1, restock: false }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.cogsReversed).toBe(0); // Restock false = HPP tidak dipulihkan

      // Tidak ada mutasi stok masuk
      expect(mockStockMovements).toHaveLength(0);
    });
  });

  describe('3. Penyelesaian CUSTOMER_CREDIT (Deposit Saldo Kredit Pelanggan)', () => {
    it('mencatat penambahan CustomerCreditEntry saat settlement bernilai CUSTOMER_CREDIT', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Salah kirim varian beras, dijadikan saldo deposit pelanggan',
            settlement: CreditSettlement.CUSTOMER_CREDIT,
            items: [{ orderItemId: 'oi_01', qty: 1, restock: true }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.settlement).toBe('CUSTOMER_CREDIT');

      // Order creditTotal TIDAK bertambah karena dialihkan ke deposit pelanggan
      const order = mockOrders.find((o) => o.id === 'ord_shipped_1');
      expect(order?.creditTotal).toBe(BigInt(0));

      // CustomerCreditEntry bertambah positif
      expect(mockCustomerCreditEntries).toHaveLength(1);
      expect(mockCustomerCreditEntries[0].amount).toBe(BigInt(70000));
      expect(mockCustomerCreditEntries[0].customerId).toBe('cust_01');

      // Cek endpoint saldo kredit pelanggan
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx);
      const balReq = new NextRequest(
        'http://localhost:3000/api/v1/customers/cust_01/credit-balance'
      );
      const balRes = await getCustomerCreditBalanceHandler(balReq, {
        params: Promise.resolve({ id: 'cust_01' }),
      });

      expect(balRes.status).toBe(200);
      const balJson = await balRes.json();
      expect(balJson.data.balance).toBe(70000);
      expect(balJson.data.entries).toHaveLength(1);
    });
  });

  describe('4. Penyelesaian REFUND (Pengembalian Kas/Transfer)', () => {
    it('membuat record Payment bertipe REFUND dan status VERIFIED', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Pelanggan meminta pengembalian uang via transfer',
            settlement: CreditSettlement.REFUND,
            items: [{ orderItemId: 'oi_01', qty: 2, restock: true }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(201);

      // Payment REFUND tercatat otomatis
      const refundPay = mockPayments.find((p) => p.type === PaymentType.REFUND);
      expect(refundPay).toBeDefined();
      expect(refundPay?.status).toBe(PaymentStatus.VERIFIED);
      expect(refundPay?.amount).toBe(BigInt(140000));
    });

    it('menolak REFUND jika total refund melebihi pembayaran terverifikasi yang diterima (422)', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      // Ubah order paidTotal = 50.000 (retur 140.000 > 50.000)
      const order = mockOrders.find((o) => o.id === 'ord_shipped_1')!;
      order.paidTotal = BigInt(50000);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Pengembalian uang melebihi yang sudah dibayar',
            settlement: CreditSettlement.REFUND,
            items: [{ orderItemId: 'oi_01', qty: 2, restock: true }],
          }),
        }
      );

      const res = await createCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe('REFUND_EXCEEDS_PAID');
    });
  });

  describe('5. Pembatalan (Void) Nota Kredit', () => {
    it('Sales ditolak 403 saat mencoba membatalkan nota kredit', async () => {
      mockCreditNotes.push({
        id: 'cn_void_target',
        businessId: BIZ_ID,
        orderId: 'ord_shipped_1',
        customerId: 'cust_01',
        number: 'CUST-001/CN/08/11/2026/0001',
        reason: 'Barang rusak',
        settlement: CreditSettlement.OFFSET,
        total: BigInt(70000),
        voidedAt: null,
        items: [],
      });

      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/credit-notes/cn_void_target/void',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({ reason: 'Dibatalkan oleh staf sales' }),
        }
      );

      const res = await voidCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'cn_void_target' }),
      });

      expect(res.status).toBe(403);
    });

    it('Super Admin berhasil void Credit Note OFFSET (membalikkan creditTotal dan stok VOID_REVERSAL)', async () => {
      // Setup CN aktif OFFSET dengan restock = true
      const cn = {
        id: 'cn_to_void',
        businessId: BIZ_ID,
        orderId: 'ord_shipped_1',
        customerId: 'cust_01',
        number: 'CUST-001/CN/08/11/2026/0002',
        reason: 'Salah input retur',
        settlement: CreditSettlement.OFFSET,
        total: BigInt(140000),
        cogsReversed: BigInt(100000),
        voidedAt: null,
      };
      mockCreditNotes.push(cn);

      mockCreditNoteItems.push({
        id: 'cni_to_void_1',
        creditNoteId: 'cn_to_void',
        orderItemId: 'oi_01',
        qty: 2,
        creditAmount: BigInt(140000),
        restock: true,
      });

      // Update creditTotal order sebelumnya
      const order = mockOrders.find((o) => o.id === 'ord_shipped_1')!;
      order.creditTotal = BigInt(140000);

      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/credit-notes/cn_to_void/void',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            reason: 'Dibatalkan atas kesepakatan ulang dengan pembeli',
          }),
        }
      );

      const res = await voidCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'cn_to_void' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.voidedAt).not.toBeNull();

      // creditTotal pada order kembali ke 0
      expect(order.creditTotal).toBe(BigInt(0));

      // Stok fisik dibalikkan keluar dengan VOID_REVERSAL
      const voidMove = mockStockMovements.find(
        (m) => m.type === StockMoveType.VOID_REVERSAL
      );
      expect(voidMove).toBeDefined();
      expect(voidMove?.qtyDelta).toBe(-2);

      // AuditLog tercatat
      expect(mockAuditLogs.some((a) => a.action === 'CREDIT_NOTE_VOID')).toBe(true);
    });

    it('menolak void CUSTOMER_CREDIT jika saldo deposit pelanggan telah digunakan di order lain (409)', async () => {
      const cn = {
        id: 'cn_credit_used',
        businessId: BIZ_ID,
        orderId: 'ord_shipped_1',
        customerId: 'cust_01',
        number: 'CUST-001/CN/08/11/2026/0003',
        reason: 'Deposit retur',
        settlement: CreditSettlement.CUSTOMER_CREDIT,
        total: BigInt(200000),
        voidedAt: null,
      };
      mockCreditNotes.push(cn);

      // Simulasikan saldo kredit pelanggan sisa 50.000 (150.000 sudah dipakai)
      mockCustomerCreditEntries.push(
        {
          id: 'cce_1',
          businessId: BIZ_ID,
          customerId: 'cust_01',
          amount: BigInt(200000),
          createdAt: new Date(),
        },
        {
          id: 'cce_2',
          businessId: BIZ_ID,
          customerId: 'cust_01',
          amount: BigInt(-150000), // Sudah dipakai di order lain
          createdAt: new Date(),
        }
      );

      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/credit-notes/cn_credit_used/void',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify({ reason: 'Batalkan nota kredit deposit' }),
        }
      );

      const res = await voidCreditNoteHandler(req, {
        params: Promise.resolve({ id: 'cn_credit_used' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('CREDIT_ALREADY_USED');
    });
  });

  describe('6. Jaminan Anti-Bocor (Zero-Leakage) pada DTO Staf Sales', () => {
    beforeEach(() => {
      mockCreditNotes.push({
        id: 'cn_leak_check',
        businessId: BIZ_ID,
        orderId: 'ord_shipped_1',
        customerId: 'cust_01',
        number: 'CUST-001/CN/08/11/2026/0005',
        reason: 'Retur produk cacat',
        settlement: CreditSettlement.OFFSET,
        amountExPpn: BigInt(70000),
        ppnAmount: BigInt(0),
        total: BigInt(70000),
        cogsReversed: BigInt(50000), // RAHASIA
        createdById: SALES_ID_1,
        createdAt: new Date(),
        voidedAt: null,
      });

      mockCreditNoteItems.push({
        id: 'cni_leak_1',
        creditNoteId: 'cn_leak_check',
        orderItemId: 'oi_01',
        qty: 1,
        creditAmount: BigInt(70000),
        restock: true,
        costReversed: BigInt(50000), // RAHASIA
      });
    });

    it('Sales yang mengambil detail Credit Note tidak menerima cogsReversed atau costReversed', async () => {

      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/credit-notes/cn_leak_check'
      );
      const res = await getCreditNoteDetailHandler(req, {
        params: Promise.resolve({ id: 'cn_leak_check' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verifikasi menggunakan assertNoSecretKeys
      assertNoSecretKeys(json.data);
      expect(json.data.cogsReversed).toBeUndefined();
      expect(json.data.items[0].costReversed).toBeUndefined();
    });

    it('Super Admin menerima cogsReversed dan costReversed secara lengkap', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/credit-notes/cn_leak_check'
      );
      const res = await getCreditNoteDetailHandler(req, {
        params: Promise.resolve({ id: 'cn_leak_check' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.cogsReversed).toBe(50000);
      expect(json.data.items[0].costReversed).toBe(50000);
    });
  });

  describe('7. Daftar Global & Filter Credit Notes', () => {
    it('mengambil daftar credit notes dengan filter pencarian dan isolasi role', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(superAdminCtx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/credit-notes?page=1&limit=10'
      );
      const res = await listCreditNotesHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta.total).toBeDefined();
    });

    it('mengambil daftar credit notes spesifik untuk suatu pesanan', async () => {
      vi.spyOn(contextModule, 'requireContext').mockResolvedValueOnce(sales1Ctx);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/orders/ord_shipped_1/credit-notes'
      );
      const res = await getOrderCreditNotesHandler(req, {
        params: Promise.resolve({ id: 'ord_shipped_1' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });
  });
});
