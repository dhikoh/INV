import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PaymentMethod, Role } from '@prisma/client';
import { formatDateId } from '@/lib/format/date';

const saveFileMock = vi.hoisted(() =>
  vi.fn(async () => ({ relativePath: 'proof/test-proof.png' }))
);

vi.mock('@/lib/files/fileService', () => ({
  saveFile: saveFileMock,
}));

import { parsePaymentInput } from '@/lib/api/paymentInput';
import {
  recalculateProductStock,
  reconcileBusinessStock,
  type Tx,
} from '@/lib/services/stock';

describe('AUD-DUP-003: formatDateId helper', () => {
  it('formats ISO date strings cleanly across presets and guards invalid dates', () => {
    const sample = '2026-11-12T08:30:00.000Z';
    expect(formatDateId(sample, 'short')).toContain('2026');
    expect(formatDateId(sample, 'long')).toContain('November');
    expect(formatDateId(sample, 'compact')).toMatch(/12/);
    expect(formatDateId(sample, 'dateTime')).toContain('2026');
    expect(formatDateId('not-a-date')).toBe('-');
  });
});

describe('AUD-DUP-002: parsePaymentInput shared helper', () => {
  beforeEach(() => {
    saveFileMock.mockClear();
  });

  it('parses JSON body without fixedOrderId and requires orderId', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId: ' ord_1 ',
        amount: 500000,
        method: PaymentMethod.CASH,
        paidAt: '2026-11-12T00:00:00.000Z',
        notes: 'Bayar DP',
        autoVerify: true,
      }),
    });

    const parsed = await parsePaymentInput(req, 'biz_1');
    expect(parsed.orderId).toBe('ord_1');
    expect(parsed.amount).toBe(500000);
    expect(parsed.method).toBe(PaymentMethod.CASH);
    expect(parsed.autoVerify).toBe(true);
    expect(parsed.notes).toBe('Bayar DP');

    const badReq = new NextRequest('http://localhost/api/v1/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 500000 }),
    });
    await expect(parsePaymentInput(badReq, 'biz_1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  });

  it('parses multipart FormData with fixedOrderId and saves uploaded proof file', async () => {
    const fd = new FormData();
    fd.set('amount', '250000');
    fd.set('method', PaymentMethod.TRANSFER);
    fd.set('reference', 'TRX-999');
    fd.set('proof', new Blob(['fake-png-bytes'], { type: 'image/png' }), 'bukti.png');

    const req = new NextRequest('http://localhost/api/v1/orders/ord_fixed/payments', {
      method: 'POST',
      body: fd,
    });

    const parsed = await parsePaymentInput(req, 'biz_1', {
      fixedOrderId: 'ord_fixed',
    });

    expect(parsed.orderId).toBe('ord_fixed');
    expect(parsed.amount).toBe(250000);
    expect(parsed.method).toBe(PaymentMethod.TRANSFER);
    expect(parsed.reference).toBe('TRX-999');
    expect(parsed.proofPath).toBe('proof/test-proof.png');
    expect(saveFileMock).toHaveBeenCalledTimes(1);
  });
});

describe('AUD-DUP-004: Stock reconciliation from StockMovement ledger', () => {
  function createMockTx(options: {
    products: Array<{ id: string; name: string; stockQty: number }>;
    ledgerSums: Record<string, number | null>;
  }) {
    const auditLogs: Array<Record<string, unknown>> = [];
    const updatedProducts: Array<{ id: string; stockQty: number }> = [];

    const tx = {
      $queryRaw: vi.fn(async () => []),
      product: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
          return options.products.find((p) => p.id === where.id) ?? null;
        }),
        findMany: vi.fn(async () => options.products),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: { stockQty: number };
          }) => {
            const p = options.products.find((x) => x.id === where.id);
            if (p) p.stockQty = data.stockQty;
            updatedProducts.push({ id: where.id, stockQty: data.stockQty });
            return { count: p ? 1 : 0 };
          }
        ),
      },
      stockMovement: {
        aggregate: vi.fn(
          async ({ where }: { where: { productId: string } }) => ({
            _sum: { qtyDelta: options.ledgerSums[where.productId] ?? null },
          })
        ),
        groupBy: vi.fn(async () =>
          Object.entries(options.ledgerSums).map(([productId, sum]) => ({
            productId,
            _sum: { qtyDelta: sum },
          }))
        ),
      },
      auditLog: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          auditLogs.push(data);
          return data;
        }),
      },
    };

    return {
      tx: tx as unknown as Tx,
      auditLogs,
      updatedProducts,
      raw: tx,
    };
  }

  it('detects drift without mutating when repair is false, and repairs + audits when true', async () => {
    const mock = createMockTx({
      products: [{ id: 'prod_1', name: 'Tuna Kaleng', stockQty: 42 }],
      ledgerSums: { prod_1: 50 },
    });

    const dryRun = await recalculateProductStock(mock.tx, {
      businessId: 'biz_1',
      productId: 'prod_1',
      repair: false,
    });
    expect(dryRun.drift).toBe(8);
    expect(dryRun.ledgerStockQty).toBe(50);
    expect(dryRun.repaired).toBe(false);
    expect(mock.updatedProducts).toHaveLength(0);

    const fixed = await recalculateProductStock(mock.tx, {
      businessId: 'biz_1',
      productId: 'prod_1',
      repair: true,
      actorId: 'admin_1',
    });
    expect(fixed.repaired).toBe(true);
    expect(fixed.drift).toBe(8);
    expect(mock.updatedProducts).toEqual([{ id: 'prod_1', stockQty: 50 }]);
    expect(mock.auditLogs).toHaveLength(1);
    expect(mock.auditLogs[0].action).toBe('STOCK_RECONCILE');
    expect(mock.auditLogs[0].actorRole).toBe(Role.SUPERADMIN);
  });

  it('reconciles a whole business in batch without touching clean products', async () => {
    const mock = createMockTx({
      products: [
        { id: 'p_ok', name: 'Pakan A', stockQty: 20 },
        { id: 'p_drift', name: 'Pakan B', stockQty: 15 },
      ],
      ledgerSums: { p_ok: 20, p_drift: 12 },
    });

    const summary = await reconcileBusinessStock(mock.tx, 'biz_1', {
      repair: true,
      actorId: 'admin_1',
    });
    expect(summary.checkedCount).toBe(2);
    expect(summary.driftedCount).toBe(1);
    expect(summary.repairedCount).toBe(1);
    expect(summary.discrepancies[0]).toMatchObject({
      productId: 'p_drift',
      recordedStockQty: 15,
      ledgerStockQty: 12,
      drift: -3,
      repaired: true,
    });
    expect(mock.raw.product.updateMany).toHaveBeenCalledTimes(1);
  });
});

