import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPurchaseOrder,
  orderPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  updatePurchaseOrder,
} from '@/lib/services/purchase-order';
import {
  recordVendorPayment,
  getVendorLedger,
} from '@/lib/services/vendor-ledger';
import { PoStatus, StockMoveType, PaymentMethod } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';

interface MockVendor {
  id: string;
  businessId: string;
  code: string;
  name: string;
  picName: string | null;
  phone: string | null;
  address: string | null;
  deletedAt: Date | null;
}

interface MockProduct {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: bigint;
  minPrice: bigint;
  costPrice: bigint;
  stockQty: number;
  reservedQty: number;
  rev: number;
  deletedAt: Date | null;
}

interface MockPurchaseOrder {
  id: string;
  businessId: string;
  vendorId: string;
  vendorSeq: number | null;
  poNo: string | null;
  status: PoStatus;
  orderDate: Date;
  expectedDate: Date | null;
  subtotal: bigint;
  shippingCost: bigint;
  otherCost: bigint;
  total: bigint;
  paidTotal: bigint;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockPurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  qty: number;
  receivedQty: number;
  unitCost: bigint;
  lineTotal: bigint;
}

interface MockVendorPayment {
  id: string;
  businessId: string;
  vendorId: string;
  purchaseOrderId: string | null;
  amount: bigint;
  paidAt: Date;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  voidedAt: Date | null;
}

interface MockPriceHistory {
  id: string;
  businessId: string;
  productId: string;
  field: string;
  oldValue: bigint | null;
  newValue: bigint;
  reason: string;
  changedById: string;
}

interface MockStockMovement {
  id: string;
  businessId: string;
  productId: string;
  type: StockMoveType;
  qtyDelta: number;
  balanceAfter: number;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdById: string;
}

let vendors: MockVendor[] = [];
let products: MockProduct[] = [];
let purchaseOrders: MockPurchaseOrder[] = [];
let purchaseOrderItems: MockPurchaseOrderItem[] = [];
let vendorPayments: MockVendorPayment[] = [];
let priceHistories: MockPriceHistory[] = [];
let stockMovements: MockStockMovement[] = [];
let auditLogs: Array<Record<string, unknown>> = [];

let poSeqCounter = 0;
let poIdCounter = 0;
let poiIdCounter = 0;
vi.mock('@/lib/services/counter', () => ({
  allocateVendorPoSeq: vi.fn(async () => {
    poSeqCounter += 1;
    return poSeqCounter;
  }),
}));

const mockPrisma = {
  $queryRaw: vi.fn(async () => []),
  $transaction: vi.fn(async (cb) => cb(mockPrisma)),
  vendor: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        vendors.find((v) => {
          if (where.id && v.id !== where.id) return false;
          if (where.businessId && v.businessId !== where.businessId) return false;
          if (where.deletedAt === null && v.deletedAt !== null) return false;
          return true;
        }) || null
      );
    }),
  },
  product: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const idIn = (where.id as { in?: string[] } | undefined)?.in;
      return products.filter((p) => {
        if (where.businessId && p.businessId !== where.businessId) return false;
        if (where.deletedAt === null && p.deletedAt !== null) return false;
        if (idIn && !idIn.includes(p.id)) return false;
        return true;
      });
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = products.find((p) => p.id === where.id);
      if (!found) throw new Error('Product not found');
      return found;
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string; businessId?: string } }) => {
      const found = products.find((p) => p.id === where.id);
      return found || null;
    }),
    findFirstOrThrow: vi.fn(async ({ where }: { where: { id: string; businessId?: string } }) => {
      const found = products.find((p) => p.id === where.id);
      if (!found) throw new Error('Product not found');
      return found;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const p = products.find((prod) => prod.id === where.id);
      if (!p) throw new Error('Product not found');
      if (data.stockQty && typeof data.stockQty === 'object' && 'increment' in (data.stockQty as { increment: number })) {
        p.stockQty += (data.stockQty as { increment: number }).increment;
      }
      if (data.costPrice !== undefined) {
        p.costPrice = BigInt(data.costPrice as number | bigint);
      }
      if (data.rev && typeof data.rev === 'object' && 'increment' in (data.rev as { increment: number })) {
        p.rev += (data.rev as { increment: number }).increment;
      }
      return { ...p };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; businessId?: string }; data: Record<string, unknown> }) => {
      const p = products.find((prod) => prod.id === where.id);
      if (!p) return { count: 0 };
      if (data.stockQty && typeof data.stockQty === 'object' && 'increment' in (data.stockQty as { increment: number })) {
        p.stockQty += (data.stockQty as { increment: number }).increment;
      }
      if (data.costPrice !== undefined) {
        p.costPrice = BigInt(data.costPrice as number | bigint);
      }
      if (data.rev && typeof data.rev === 'object' && 'increment' in (data.rev as { increment: number })) {
        p.rev += (data.rev as { increment: number }).increment;
      }
      return { count: 1 };
    }),
  },
  purchaseOrder: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const po = purchaseOrders.find((p) => {
        if (where.id && p.id !== where.id) return false;
        if (where.businessId && p.businessId !== where.businessId) return false;
        if (where.vendorId && p.vendorId !== where.vendorId) return false;
        if (where.deletedAt === null && p.deletedAt !== null) return false;
        return true;
      });
      if (!po) return null;
      const v = vendors.find((vend) => vend.id === po.vendorId);
      const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === po.id);
      return { ...po, vendor: v, items };
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const filtered = purchaseOrders.filter((p) => {
        if (where.businessId && p.businessId !== where.businessId) return false;
        if (where.vendorId && p.vendorId !== where.vendorId) return false;
        if (where.deletedAt === null && p.deletedAt !== null) return false;
        if (where.status && typeof where.status === 'object' && 'not' in (where.status as { not: string })) {
          if (p.status === (where.status as { not: string }).not) return false;
        }
        return true;
      });
      return filtered.map((po) => {
        const v = vendors.find((vend) => vend.id === po.vendorId);
        const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === po.id);
        return { ...po, vendor: v, items };
      });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `po_${++poIdCounter}`;
      const itemsCreate = (data.items as { create: Array<Record<string, unknown>> })?.create || [];
      const po: MockPurchaseOrder = {
        id,
        businessId: data.businessId as string,
        vendorId: data.vendorId as string,
        vendorSeq: (data.vendorSeq as number) || null,
        poNo: (data.poNo as string) || null,
        status: (data.status as PoStatus) || PoStatus.DRAFT,
        orderDate: data.orderDate as Date,
        expectedDate: (data.expectedDate as Date) || null,
        subtotal: BigInt(data.subtotal as number | bigint),
        shippingCost: BigInt(data.shippingCost as number | bigint),
        otherCost: BigInt(data.otherCost as number | bigint),
        total: BigInt(data.total as number | bigint),
        paidTotal: 0n,
        notes: (data.notes as string) || null,
        createdById: data.createdById as string,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      purchaseOrders.push(po);

      const createdItems: MockPurchaseOrderItem[] = itemsCreate.map((item) => {
        const itemRecord: MockPurchaseOrderItem = {
          id: `poi_${++poiIdCounter}`,
          purchaseOrderId: id,
          productId: item.productId as string,
          qty: item.qty as number,
          receivedQty: 0,
          unitCost: BigInt(item.unitCost as number | bigint),
          lineTotal: BigInt(item.lineTotal as number | bigint),
        };
        purchaseOrderItems.push(itemRecord);
        return itemRecord;
      });

      const v = vendors.find((vend) => vend.id === po.vendorId);
      return { ...po, vendor: v, items: createdItems };
    }),
    findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const po = purchaseOrders.find((p) => {
        if (where.id && p.id !== where.id) return false;
        if (where.businessId && p.businessId !== where.businessId) return false;
        return true;
      });
      if (!po) throw new Error('PO not found');
      const v = vendors.find((vend) => vend.id === po.vendorId);
      const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === po.id);
      return { ...po, vendor: v, items };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const po = purchaseOrders.find((p) => p.id === where.id);
      if (!po) throw new Error('PO not found');

      if (data.status) po.status = data.status as PoStatus;
      if (data.vendorId !== undefined) po.vendorId = data.vendorId as string;
      if (data.orderDate !== undefined) po.orderDate = data.orderDate as Date;
      if (data.expectedDate !== undefined) po.expectedDate = data.expectedDate as Date;
      if (data.vendorSeq !== undefined) po.vendorSeq = data.vendorSeq as number;
      if (data.poNo !== undefined) po.poNo = data.poNo as string;
      if (data.subtotal !== undefined) po.subtotal = BigInt(data.subtotal as number | bigint);
      if (data.shippingCost !== undefined) po.shippingCost = BigInt(data.shippingCost as number | bigint);
      if (data.otherCost !== undefined) po.otherCost = BigInt(data.otherCost as number | bigint);
      if (data.total !== undefined) po.total = BigInt(data.total as number | bigint);
      if (data.paidTotal !== undefined) po.paidTotal = BigInt(data.paidTotal as number | bigint);
      if (data.notes !== undefined) po.notes = data.notes as string;

      const v = vendors.find((vend) => vend.id === po.vendorId);
      const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === po.id);
      return { ...po, vendor: v, items };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const po = purchaseOrders.find((p) => p.id === where.id);
      if (!po) return { count: 0 };

      if (data.status) po.status = data.status as PoStatus;
      if (data.vendorId !== undefined) po.vendorId = data.vendorId as string;
      if (data.orderDate !== undefined) po.orderDate = data.orderDate as Date;
      if (data.expectedDate !== undefined) po.expectedDate = data.expectedDate as Date;
      if (data.vendorSeq !== undefined) po.vendorSeq = data.vendorSeq as number;
      if (data.poNo !== undefined) po.poNo = data.poNo as string;
      if (data.subtotal !== undefined) po.subtotal = BigInt(data.subtotal as number | bigint);
      if (data.shippingCost !== undefined) po.shippingCost = BigInt(data.shippingCost as number | bigint);
      if (data.otherCost !== undefined) po.otherCost = BigInt(data.otherCost as number | bigint);
      if (data.total !== undefined) po.total = BigInt(data.total as number | bigint);
      if (data.paidTotal !== undefined) po.paidTotal = BigInt(data.paidTotal as number | bigint);
      if (data.notes !== undefined) po.notes = data.notes as string;

      return { count: 1 };
    }),
  },
  purchaseOrderItem: {
    deleteMany: vi.fn(async ({ where }: { where: { purchaseOrderId: string } }) => {
      purchaseOrderItems = purchaseOrderItems.filter((i) => i.purchaseOrderId !== where.purchaseOrderId);
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      data.forEach((item) => {
        purchaseOrderItems.push({
          id: `poi_${++poiIdCounter}`,
          purchaseOrderId: item.purchaseOrderId as string,
          productId: item.productId as string,
          qty: item.qty as number,
          receivedQty: 0,
          unitCost: BigInt(item.unitCost as number | bigint),
          lineTotal: BigInt(item.lineTotal as number | bigint),
        });
      });
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const item = purchaseOrderItems.find((i) => i.id === where.id);
      if (!item) throw new Error('PO item not found');
      if (data.receivedQty && typeof data.receivedQty === 'object' && 'increment' in (data.receivedQty as { increment: number })) {
        item.receivedQty += (data.receivedQty as { increment: number }).increment;
      }
      return { ...item };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const item = purchaseOrderItems.find((i) => i.id === where.id);
      if (!item) return { count: 0 };
      if (data.receivedQty && typeof data.receivedQty === 'object' && 'increment' in (data.receivedQty as { increment: number })) {
        item.receivedQty += (data.receivedQty as { increment: number }).increment;
      }
      return { count: 1 };
    }),
    findMany: vi.fn(async ({ where }: { where: { purchaseOrderId: string } }) => {
      return purchaseOrderItems.filter((i) => i.purchaseOrderId === where.purchaseOrderId);
    }),
  },
  vendorPayment: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const pay: MockVendorPayment = {
        id: `vp_${Date.now()}_${Math.random()}`,
        businessId: data.businessId as string,
        vendorId: data.vendorId as string,
        purchaseOrderId: (data.purchaseOrderId as string) || null,
        amount: BigInt(data.amount as number | bigint),
        paidAt: data.paidAt as Date,
        method: data.method as PaymentMethod,
        reference: (data.reference as string) || null,
        notes: (data.notes as string) || null,
        createdById: data.createdById as string,
        createdAt: new Date(),
        voidedAt: null,
      };
      vendorPayments.push(pay);
      return pay;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return vendorPayments.filter((vp) => {
        if (where.businessId && vp.businessId !== where.businessId) return false;
        if (where.vendorId && vp.vendorId !== where.vendorId) return false;
        if (where.purchaseOrderId && vp.purchaseOrderId !== where.purchaseOrderId) return false;
        if (where.voidedAt === null && vp.voidedAt !== null) return false;
        return true;
      });
    }),
  },
  priceHistory: {
    create: vi.fn(async ({ data }: { data: Omit<MockPriceHistory, 'id'> }) => {
      const record = { id: `ph_${Date.now()}`, ...data };
      priceHistories.push(record);
      return record;
    }),
    findFirst: vi.fn(async ({ where }: { where: { productId: string; field: string } }) => {
      return priceHistories.find((ph) => ph.productId === where.productId && ph.field === where.field) || null;
    }),
  },
  stockMovement: {
    create: vi.fn(async ({ data }: { data: Omit<MockStockMovement, 'id'> }) => {
      const record = { id: `sm_${Date.now()}`, ...data };
      stockMovements.push(record);
      return record;
    }),
    findFirst: vi.fn(async ({ where }: { where: { productId: string; type: StockMoveType } }) => {
      return stockMovements.find((sm) => sm.productId === where.productId && sm.type === where.type) || null;
    }),
  },
  auditLog: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      auditLogs.push(data);
      return data;
    }),
  },
};

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

describe('Purchase Order & Vendor Ledger: purchase-order.ts & vendor-ledger.ts (T2.7)', () => {
  const businessId = 'biz_po_test';
  const adminId = 'user_admin_po';
  const vendorId = 'vend_01';
  const productId = 'prod_po_01';

  beforeEach(() => {
    poSeqCounter = 0;
    vendors = [
      {
        id: vendorId,
        businessId,
        code: 'VND01',
        name: 'PT Pemasok Utama',
        picName: 'Budi Santoso',
        phone: '08123456789',
        address: 'Jl. Industri No. 10',
        deletedAt: null,
      },
    ];

    products = [
      {
        id: productId,
        businessId,
        sku: 'SKU-PO-01',
        name: 'Barang Pesanan PO',
        unit: 'DUS',
        basePrice: 150000n,
        minPrice: 120000n,
        costPrice: 90000n,
        stockQty: 20,
        reservedQty: 0,
        rev: 0,
        deletedAt: null,
      },
    ];

    purchaseOrders = [];
    purchaseOrderItems = [];
    vendorPayments = [];
    priceHistories = [];
    stockMovements = [];
    auditLogs = [];
  });

  it('Alur lengkap PO: buat DRAFT -> ubah DRAFT -> ORDERED (alokasi nomor PO)', async () => {
    // 1. Buat DRAFT
    const { po: draftPo } = await createPurchaseOrder(mockPrisma as any, businessId, adminId, {
      vendorId,
      orderDate: '2026-11-10',
      shippingCost: 25000,
      otherCost: 5000,
      notes: 'Draf pesanan pembelian bahan baku',
      items: [{ productId, qty: 10, unitCost: 95000 }],
    });

    expect(draftPo.status).toBe(PoStatus.DRAFT);
    expect(Number(draftPo.subtotal)).toBe(950000);
    expect(Number(draftPo.total)).toBe(980000); // 950000 + 25000 + 5000
    expect(draftPo.poNo).toBeNull();

    // 2. Ubah DRAFT
    const { po: updatedPo } = await updatePurchaseOrder(mockPrisma as any, businessId, draftPo.id, adminId, {
      shippingCost: 30000,
      items: [{ productId, qty: 15, unitCost: 90000 }],
    });

    expect(Number(updatedPo.subtotal)).toBe(1350000);
    expect(Number(updatedPo.total)).toBe(1385000); // 1350000 + 30000 + 5000

    // 3. Pesan (ORDERED) -> Alokasi poNo resmi
    const { po: orderedPo } = await orderPurchaseOrder(mockPrisma as any, businessId, draftPo.id, adminId);

    expect(orderedPo.status).toBe(PoStatus.ORDERED);
    expect(orderedPo.vendorSeq).toBe(1);
    expect(orderedPo.poNo).toMatch(/^VND01\/PO\/\d{2}\/\d{2}\/\d{4}\/0001$/);
  });

  it('Penerimaan PO menambah stok, menghasilkan mutasi PO_RECEIPT, dan memperbarui HPP dengan PriceHistory', async () => {
    const created = await createPurchaseOrder(mockPrisma as any, businessId, adminId, {
      vendorId,
      orderDate: '2026-11-10',
      items: [{ productId, qty: 10, unitCost: 92000 }],
    });
    const { po: orderedPo } = await orderPurchaseOrder(mockPrisma as any, businessId, created.po.id, adminId);

    const item = orderedPo.items[0];

    // Penerimaan parsial (4 unit) dengan updateHpp = true
    const { po: receivedPart } = await receivePurchaseOrder(mockPrisma as any, businessId, orderedPo.id, adminId, {
      items: [{ itemId: item.id, qty: 4, updateHpp: true }],
    });

    expect(receivedPart.status).toBe(PoStatus.PARTIAL_RECEIVED);

    // Stok fisik awal 20 + 4 = 24
    let prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(24);
    expect(Number(prod?.costPrice)).toBe(92000); // HPP diperbarui dari 90000 ke 92000

    // Mutasi stok tercatat
    const movement = stockMovements.find((m) => m.productId === productId && m.type === StockMoveType.PO_RECEIPT);
    expect(movement?.qtyDelta).toBe(4);
    expect(movement?.balanceAfter).toBe(24);

    // Riwayat perubahan harga HPP (PriceHistory)
    const priceHist = priceHistories.find((ph) => ph.productId === productId && ph.field === 'COST');
    expect(priceHist).toBeDefined();
    expect(Number(priceHist?.oldValue)).toBe(90000);
    expect(Number(priceHist?.newValue)).toBe(92000);

    // Penerimaan sisa (6 unit) tanpa updateHpp
    const { po: receivedFull } = await receivePurchaseOrder(mockPrisma as any, businessId, orderedPo.id, adminId, {
      items: [{ itemId: item.id, qty: 6, updateHpp: false }],
    });

    expect(receivedFull.status).toBe(PoStatus.RECEIVED);

    prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(30); // 24 + 6
  });

  it('Pembatalan PO: Berhasil jika belum ada penerimaan, ditolak 409 jika sudah ada penerimaan barang', async () => {
    // 1. PO tanpa penerimaan -> Bisa dibatalkan
    const created1 = await createPurchaseOrder(mockPrisma as any, businessId, adminId, {
      vendorId,
      orderDate: '2026-11-10',
      items: [{ productId, qty: 5, unitCost: 80000 }],
    });
    const { po: orderedPo1 } = await orderPurchaseOrder(mockPrisma as any, businessId, created1.po.id, adminId);

    const { po: cancelledPo } = await cancelPurchaseOrder(
      mockPrisma as any,
      businessId,
      orderedPo1.id,
      adminId,
      'Vendor kehabisan bahan baku dan tidak sanggup kirim'
    );

    expect(cancelledPo.status).toBe(PoStatus.CANCELLED);

    // 2. PO yang sudah ada penerimaan -> Ditolak 409 CANNOT_CANCEL
    const created2 = await createPurchaseOrder(mockPrisma as any, businessId, adminId, {
      vendorId,
      orderDate: '2026-11-10',
      items: [{ productId, qty: 5, unitCost: 80000 }],
    });
    const { po: orderedPo2 } = await orderPurchaseOrder(mockPrisma as any, businessId, created2.po.id, adminId);
    await receivePurchaseOrder(mockPrisma as any, businessId, orderedPo2.id, adminId, {
      items: [{ itemId: orderedPo2.items[0].id, qty: 2 }],
    });

    await expect(
      cancelPurchaseOrder(
        mockPrisma as any,
        businessId,
        orderedPo2.id,
        adminId,
        'Coba batalkan PO yang sudah separuh sampai'
      )
    ).rejects.toThrowError(DomainError);
  });

  it('Buku Transaksi Vendor (Vendor Ledger) menjumlah debit, kredit, dan saldo hutang dengan tepat', async () => {
    // 1. Buat PO pertama senilai Rp 500.000
    const { po: po1 } = await createPurchaseOrder(mockPrisma as any, businessId, adminId, {
      vendorId,
      orderDate: '2026-11-01',
      shippingCost: 0,
      items: [{ productId, qty: 5, unitCost: 100000 }],
    });

    // 2. Buat PO kedua senilai Rp 300.000
    const { po: po2 } = await createPurchaseOrder(mockPrisma as any, businessId, adminId, {
      vendorId,
      orderDate: '2026-11-03',
      shippingCost: 0,
      items: [{ productId, qty: 3, unitCost: 100000 }],
    });

    // 3. Catat Pembayaran pertama Rp 400.000 (terkait PO1)
    await recordVendorPayment(mockPrisma as any, businessId, vendorId, adminId, {
      purchaseOrderId: po1.id,
      amount: 400000,
      paidAt: '2026-11-02',
      method: PaymentMethod.TRANSFER,
      reference: 'TRX-BCA-001',
      notes: 'DP pesanan pertama',
    });

    // 4. Catat Pembayaran kedua Rp 250.000 (pembayaran umum)
    await recordVendorPayment(mockPrisma as any, businessId, vendorId, adminId, {
      amount: 250000,
      paidAt: '2026-11-04',
      method: PaymentMethod.TRANSFER,
      reference: 'TRX-BCA-002',
    });

    // 5. Periksa Buku Transaksi Vendor
    const ledger = await getVendorLedger(mockPrisma as any, businessId, vendorId);

    // Total Beli: 500.000 + 300.000 = 800.000
    expect(ledger.summary.totalPurchases).toBe(800000);
    // Total Bayar: 400.000 + 250.000 = 650.000
    expect(ledger.summary.totalPayments).toBe(650000);
    // Sisa Hutang ke Vendor: 800.000 - 650.000 = 150.000
    expect(ledger.summary.currentBalance).toBe(150000);

    // Verifikasi urutan linimasa kronologis & saldo berjalan
    expect(ledger.entries.length).toBe(4);

    // Entri 1: PO 1 (2026-11-01) -> Beli 500.000, Saldo 500.000
    expect(ledger.entries[0].type).toBe('PURCHASE');
    expect(ledger.entries[0].debit).toBe(500000);
    expect(ledger.entries[0].credit).toBe(0);
    expect(ledger.entries[0].balance).toBe(500000);

    // Entri 2: Bayar 1 (2026-11-02) -> Bayar 400.000, Saldo 100.000
    expect(ledger.entries[1].type).toBe('PAYMENT');
    expect(ledger.entries[1].debit).toBe(0);
    expect(ledger.entries[1].credit).toBe(400000);
    expect(ledger.entries[1].balance).toBe(100000);

    // Entri 3: PO 2 (2026-11-03) -> Beli 300.000, Saldo 400.000
    expect(ledger.entries[2].type).toBe('PURCHASE');
    expect(ledger.entries[2].debit).toBe(300000);
    expect(ledger.entries[2].credit).toBe(0);
    expect(ledger.entries[2].balance).toBe(400000);

    // Entri 4: Bayar 2 (2026-11-04) -> Bayar 250.000, Saldo 150.000
    expect(ledger.entries[3].type).toBe('PAYMENT');
    expect(ledger.entries[3].debit).toBe(0);
    expect(ledger.entries[3].credit).toBe(250000);
    expect(ledger.entries[3].balance).toBe(150000);

    // Periksa bahwa PO1 memiliki paidTotal = 400.000
    const po1Reloaded = purchaseOrders.find((p) => p.id === po1.id);
    expect(Number(po1Reloaded?.paidTotal)).toBe(400000);
  });
});
