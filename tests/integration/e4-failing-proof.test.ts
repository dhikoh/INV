import { describe, it, expect, vi } from 'vitest';
import {
  Role,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
} from '@prisma/client';
import { requestFinalOrder } from '@/lib/services/order';
import type { Ctx } from '@/lib/auth/context';

describe('Audit Mandat: Verifikasi Perbaikan E4 & Tabel Settlement (AUD-INT-001)', () => {
  const ctx: Ctx = {
    user: {
      id: 'admin_1',
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: 'biz_1',
    },
    role: Role.SUPERADMIN,
    businessId: 'biz_1',
    sessionId: 'sess_1',
    ip: '127.0.0.1',
  };

  it('LULUS VERIFIKASI AUD-INT-001: requestFinalOrder memotong order.creditTotal dari sisa invoice pelunasan (OFFSET)', async () => {
    // Skenario Pemilik:
    // Nilai pesanan: Rp 1.000.000
    // Pembayaran DP: Rp 300.000
    // Retur barang dengan Nota Kredit (OFFSET): Rp 200.000
    // Sisa tagihan pelunasan yang diharapkan: Rp 500.000 (1.000.000 - 300.000 - 200.000)

    const orderData = {
      id: 'ord_e4_test',
      businessId: 'biz_1',
      customerId: 'cust_1',
      salesId: 'sales_1',
      status: OrderStatus.IN_PROCESS,
      grandTotal: 1000000n,
      dpAmount: 300000n,
      paidTotal: 300000n,
      creditTotal: 200000n, // Nota kredit OFFSET telah dicatat
      shippingCharge: 0n,
      ppnEnabled: false,
      ppnRateBps: 0,
      dpBps: 3000,
      deletedAt: null,
      rev: 1,
    };

    let createdInvoiceAmount: bigint | null = null;

    const mockTx = {
      $queryRaw: vi.fn(async () => [{ id: 'ord_e4_test' }]),
      order: {
        findFirst: vi.fn(async () => orderData),
        findFirstOrThrow: vi.fn(async () => ({
          ...orderData,
          customer: { id: 'cust_1', name: 'Pelanggan 1' },
          items: [],
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      orderItem: {
        findMany: vi.fn(async () => [
          {
            id: 'item_1',
            qty: 10,
            unitPrice: 100000n,
            discountBps: 0,
            subtotal: 1000000n,
            lineNet: 1000000n,
            costPrice: 50000n,
            sortOrder: 1,
          },
        ]),
      },
      orderCost: {
        findMany: vi.fn(async () => []),
      },
      invoice: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where?: { type?: InvoiceType; status?: InvoiceStatus };
          }) => {
            if (where?.type === InvoiceType.DP) {
              return {
                id: 'inv_dp_1',
                type: InvoiceType.DP,
                status: InvoiceStatus.APPROVED,
                amount: 300000n,
                paidAmount: 300000n,
              };
            }
            if (where?.status === InvoiceStatus.PENDING_APPROVAL) {
              return null; // Tidak ada invoice pending
            }
            return null;
          }
        ),
        findFirstOrThrow: vi.fn(async () => ({
          id: 'inv_final_1',
          type: InvoiceType.FINAL,
          status: InvoiceStatus.PENDING_APPROVAL,
          amount: createdInvoiceAmount,
        })),
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: { amount: bigint } }) => {
          createdInvoiceAmount = data.amount;
          return { id: 'inv_final_1', ...data };
        }),
      },
      user: {
        findMany: vi.fn(async () => [{ id: 'admin_1' }]),
      },
      notification: {
        create: vi.fn(async () => ({})),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
    };

    // Jalankan pembuatan invoice FINAL
    await requestFinalOrder(mockTx as never, ctx, 'ord_e4_test');

    expect(createdInvoiceAmount).toBe(500000n);
  });

  it('Verifikasi Settlement CUSTOMER_CREDIT: order.creditTotal tetap 0, invoice pelunasan tetap menagih selisih DP (Rp 700.000)', async () => {
    // Skenario CUSTOMER_CREDIT:
    // Retur dimasukkan ke deposit saldo kredit pelanggan untuk pesanan mendatang,
    // sehingga pesanan aktif tetap harus dilunasi secara penuh (Rp 700.000).
    const orderData = {
      id: 'ord_e4_credit_test',
      businessId: 'biz_1',
      customerId: 'cust_1',
      salesId: 'sales_1',
      status: OrderStatus.IN_PROCESS,
      grandTotal: 1000000n,
      dpAmount: 300000n,
      paidTotal: 300000n,
      creditTotal: 0n, // Pada CUSTOMER_CREDIT, creditTotal order tidak dinaikkan
      shippingCharge: 0n,
      ppnEnabled: false,
      ppnRateBps: 0,
      dpBps: 3000,
      deletedAt: null,
      rev: 1,
    };

    let createdInvoiceAmount: bigint | null = null;

    const mockTx = {
      $queryRaw: vi.fn(async () => [{ id: 'ord_e4_credit_test' }]),
      order: {
        findFirst: vi.fn(async () => orderData),
        findFirstOrThrow: vi.fn(async () => ({
          ...orderData,
          customer: { id: 'cust_1', name: 'Pelanggan 1' },
          items: [],
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      orderItem: {
        findMany: vi.fn(async () => [
          {
            id: 'item_1',
            qty: 10,
            unitPrice: 100000n,
            discountBps: 0,
            subtotal: 1000000n,
            lineNet: 1000000n,
            costPrice: 50000n,
            sortOrder: 1,
          },
        ]),
      },
      orderCost: {
        findMany: vi.fn(async () => []),
      },
      invoice: {
        findFirst: vi.fn(async ({ where }: { where?: { type?: InvoiceType } }) => {
          if (where?.type === InvoiceType.DP) {
            return {
              id: 'inv_dp_1',
              type: InvoiceType.DP,
              status: InvoiceStatus.APPROVED,
              amount: 300000n,
              paidAmount: 300000n,
            };
          }
          return null;
        }),
        findFirstOrThrow: vi.fn(async () => ({
          id: 'inv_final_1',
          type: InvoiceType.FINAL,
          status: InvoiceStatus.PENDING_APPROVAL,
          amount: createdInvoiceAmount,
        })),
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: { amount: bigint } }) => {
          createdInvoiceAmount = data.amount;
          return { id: 'inv_final_1', ...data };
        }),
      },
      user: {
        findMany: vi.fn(async () => [{ id: 'admin_1' }]),
      },
      notification: {
        create: vi.fn(async () => ({})),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
    };

    await requestFinalOrder(mockTx as never, ctx, 'ord_e4_credit_test');

    // Pelunasan tetap Rp 700.000 karena kredit ditampung di customerCreditEntry
    expect(createdInvoiceAmount).toBe(700000n);
  });
});
