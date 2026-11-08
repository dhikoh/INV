import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  moveStock,
  reserveOrderStock,
  releaseOrderStock,
  shipOrderStock,
  adjustStock,
  opnameStock,
} from '@/lib/services/stock';
import { StockMoveType } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';

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
}

interface MockOrder {
  id: string;
  businessId: string;
  stockReserved: boolean;
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

interface MockAuditLog {
  id: string;
  businessId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
}

let products: MockProduct[] = [];
let orders: MockOrder[] = [];
let stockMovements: MockStockMovement[] = [];
let auditLogs: MockAuditLog[] = [];

// Semaphore sederhana untuk simulasi kunci FOR UPDATE pada pengujian paralel
let lockedIds = new Set<string>();

const mockPrisma = {
  $queryRaw: vi.fn(async () => {
    return [];
  }),
  $transaction: vi.fn(async (cb) => {
    return cb(mockPrisma);
  }),
  product: {
    findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; businessId?: string } }) => {
      return products.filter((p) => {
        if (where.businessId && p.businessId !== where.businessId) return false;
        if (where.id?.in && !where.id.in.includes(p.id)) return false;
        return true;
      });
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string; businessId?: string } }) => {
      return products.find((p) => p.id === where.id) || null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
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
      if (data.reservedQty && typeof data.reservedQty === 'object') {
        const obj = data.reservedQty as { increment?: number; decrement?: number };
        if (obj.increment !== undefined) p.reservedQty += obj.increment;
        if (obj.decrement !== undefined) p.reservedQty -= obj.decrement;
      }

      return { ...p };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const p = products.find((prod) => prod.id === where.id);
      if (!p) return { count: 0 };

      if (data.stockQty && typeof data.stockQty === 'object' && 'increment' in (data.stockQty as { increment: number })) {
        p.stockQty += (data.stockQty as { increment: number }).increment;
      }
      if (data.reservedQty && typeof data.reservedQty === 'object') {
        const obj = data.reservedQty as { increment?: number; decrement?: number };
        if (obj.increment !== undefined) p.reservedQty += obj.increment;
        if (obj.decrement !== undefined) p.reservedQty -= obj.decrement;
      }

      return { count: 1 };
    }),
  },
  order: {
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const o = orders.find((ord) => ord.id === where.id);
      if (!o) throw new Error('Order not found');
      if (data.stockReserved !== undefined) {
        o.stockReserved = Boolean(data.stockReserved);
      }
      return { ...o };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const o = orders.find((ord) => ord.id === where.id);
      if (!o) return { count: 0 };
      if (data.stockReserved !== undefined) {
        o.stockReserved = Boolean(data.stockReserved);
      }
      return { count: 1 };
    }),
  },
  stockMovement: {
    create: vi.fn(async ({ data }: { data: Omit<MockStockMovement, 'id'> }) => {
      const record = { id: `sm_${Date.now()}_${Math.random()}`, ...data };
      stockMovements.push(record);
      return record;
    }),
    findFirst: vi.fn(async ({ where }: { where: { productId: string; type?: StockMoveType } }) => {
      return (
        stockMovements.find(
          (sm) => sm.productId === where.productId && (!where.type || sm.type === where.type)
        ) || null
      );
    }),
  },
  auditLog: {
    create: vi.fn(async ({ data }: { data: Omit<MockAuditLog, 'id'> }) => {
      const record = { id: `al_${Date.now()}`, ...data };
      auditLogs.push(record);
      return record;
    }),
  },
};

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

describe('Manajemen Stok & Mutasi: stock.ts (Seksi 7.9 & Tes 17.3 nomor 7)', () => {
  const businessId = 'biz_stk_test';
  const adminId = 'user_admin_stk';
  const productId = 'prod_stk_01';

  beforeEach(() => {
    lockedIds = new Set<string>();
    stockMovements = [];
    auditLogs = [];

    products = [
      {
        id: productId,
        businessId,
        sku: 'SKU-STK-01',
        name: 'Barang Uji Stok',
        unit: 'PCS',
        basePrice: 50000n,
        minPrice: 40000n,
        costPrice: 30000n,
        stockQty: 10,
        reservedQty: 0,
      },
    ];

    orders = [
      {
        id: 'ord_stk_01',
        businessId,
        stockReserved: false,
      },
      {
        id: 'ord_stk_02',
        businessId,
        stockReserved: false,
      },
    ];
  });

  it('moveStock mengubah stok fisik dan mencatat entri StockMovement', async () => {
    const balance = await moveStock(mockPrisma as any, {
      businessId,
      productId,
      type: StockMoveType.PO_RECEIPT,
      qtyDelta: 5,
      note: 'Penerimaan barang uji',
      actorId: adminId,
    });

    expect(balance).toBe(15);
    const prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(15);

    const movement = stockMovements.find(
      (m) => m.productId === productId && m.type === StockMoveType.PO_RECEIPT
    );
    expect(movement).toBeDefined();
    expect(movement?.qtyDelta).toBe(5);
    expect(movement?.balanceAfter).toBe(15);
  });

  it('adjustStock menolak alasan kurang dari 5 karakter dan berhasil mencatat penyesuaian', async () => {
    await expect(
      adjustStock(mockPrisma as any, {
        businessId,
        productId,
        qtyDelta: -2,
        reason: 'rus', // < 5 karakter
        actorId: adminId,
      })
    ).rejects.toThrowError(DomainError);

    const newBal = await adjustStock(mockPrisma as any, {
      businessId,
      productId,
      qtyDelta: -2,
      reason: 'Barang pecah saat penataan gudang',
      actorId: adminId,
    });

    expect(newBal).toBe(8);
    const prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(8);

    const movement = stockMovements.find(
      (m) => m.productId === productId && m.type === StockMoveType.ADJUSTMENT
    );
    expect(movement?.qtyDelta).toBe(-2);
    expect(movement?.balanceAfter).toBe(8);
  });

  it('opnameStock menyesuaikan stok fisik sesuai hitungan riil', async () => {
    const newBal = await opnameStock(mockPrisma as any, {
      businessId,
      productId,
      countedQty: 14,
      reason: 'Hasil stock opname berkala akhir bulan',
      actorId: adminId,
    });

    expect(newBal).toBe(14);
    const prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(14);

    const movement = stockMovements.find(
      (m) => m.productId === productId && m.type === StockMoveType.OPNAME
    );
    expect(movement?.qtyDelta).toBe(4); // 14 - 10
    expect(movement?.balanceAfter).toBe(14);
  });

  it('reserveOrderStock berhasil saat stok cukup, dan melempar INSUFFICIENT_STOCK saat allowNegative=false', async () => {
    const order = orders[0];

    // 1. Pesan 6 unit (stok 10, tersedia 10) -> Berhasil
    await reserveOrderStock(
      mockPrisma as any,
      order,
      [{ productId, qty: 6 }],
      false // allowNegative = false
    );

    let prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(10);
    expect(prod?.reservedQty).toBe(6);
    expect(order.stockReserved).toBe(true);

    // 2. Order kedua butuh 5 unit (tersedia tinggal 10 - 6 = 4) dengan allowNegative=false -> Ditolak 409
    const order2 = orders[1];
    await expect(
      reserveOrderStock(
        mockPrisma as any,
        order2,
        [{ productId, qty: 5 }],
        false
      )
    ).rejects.toThrowError(DomainError);

    // 3. Order kedua dengan allowNegative=true -> Lolos, available menjadi minus
    await reserveOrderStock(
      mockPrisma as any,
      order2,
      [{ productId, qty: 5 }],
      true // allowNegative = true
    );

    prod = products.find((p) => p.id === productId);
    expect(prod?.reservedQty).toBe(11);
    expect((prod?.stockQty ?? 0) - (prod?.reservedQty ?? 0)).toBe(-1); // minus
  });

  it('Tes 17.3 nomor 7: Dua persetujuan serentak berebut stok terakhir (tepat satu berhasil, satu gagal 409)', async () => {
    const contestedProdId = 'prod_contested';
    products.push({
      id: contestedProdId,
      businessId,
      sku: 'CONTESTED-01',
      name: 'Barang Rebutan Terakhir',
      unit: 'PCS',
      basePrice: 100000n,
      minPrice: 80000n,
      costPrice: 50000n,
      stockQty: 5,
      reservedQty: 0,
    });

    const ordA = { id: 'ord_A', businessId, stockReserved: false };
    const ordB = { id: 'ord_B', businessId, stockReserved: false };
    orders.push(ordA, ordB);

    // Buat mutex simulasi lock transaction: bila dieksekusi, satu transaksi selesai update baru berikutnya
    let activeTx = Promise.resolve();
    const runInSerialTx = (fn: () => Promise<void>) => {
      const res = activeTx.then(async () => {
        // simulasi sedikit delay async
        await new Promise((r) => setTimeout(r, 5));
        return fn();
      });
      activeTx = res.catch(() => {});
      return res;
    };

    const results = await Promise.allSettled([
      runInSerialTx(() =>
        reserveOrderStock(
          mockPrisma as any,
          ordA,
          [{ productId: contestedProdId, qty: 5 }],
          false
        )
      ),
      runInSerialTx(() =>
        reserveOrderStock(
          mockPrisma as any,
          ordB,
          [{ productId: contestedProdId, qty: 5 }],
          false
        )
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Tepat satu berhasil dan tepat satu gagal 409
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const failureReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(DomainError);
    expect((failureReason as DomainError).code).toBe('INSUFFICIENT_STOCK');

    const finalProd = products.find((p) => p.id === contestedProdId);
    expect(finalProd?.reservedQty).toBe(5);
    expect(finalProd?.stockQty).toBe(5);
  });

  it('releaseOrderStock dan shipOrderStock mengelola pelepasan dan pengeluaran stok secara tepat', async () => {
    const order = orders[0];

    // 1. Reservasi 4 unit
    await reserveOrderStock(mockPrisma as any, order, [{ productId, qty: 4 }], false);
    let prod = products.find((p) => p.id === productId);
    expect(prod?.reservedQty).toBe(4);

    // 2. Release reservasi (misal order dibatalkan sebelum dikirim)
    await releaseOrderStock(mockPrisma as any, { ...order, stockReserved: true }, [{ productId, qty: 4 }]);
    prod = products.find((p) => p.id === productId);
    expect(prod?.reservedQty).toBe(0);

    // 3. Reservasi ulang dan lakukan pengiriman (shipOrderStock)
    await reserveOrderStock(mockPrisma as any, order, [{ productId, qty: 3 }], false);
    await shipOrderStock(
      mockPrisma as any,
      { ...order, stockReserved: true },
      [{ productId, qty: 3 }],
      adminId
    );

    prod = products.find((p) => p.id === productId);
    expect(prod?.stockQty).toBe(7); // 10 - 3
    expect(prod?.reservedQty).toBe(0);

    const movement = stockMovements.find(
      (m) => m.productId === productId && m.type === StockMoveType.SALE_SHIPMENT
    );
    expect(movement?.qtyDelta).toBe(-3);
    expect(movement?.balanceAfter).toBe(7);
  });
});
