import { describe, it, expect, vi } from 'vitest';
import {
  Role,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
} from '@prisma/client';
import { requestFinalOrder } from '@/lib/services/order';
import type { Ctx } from '@/lib/auth/context';

describe('Audit Mandat: Pembuktian Kegagalan E4 (AUD-INT-001 Overbilling Faktur Pelunasan)', () => {
  const ctx: Ctx = {
    user: {
      id: 'admin_1',
      username: 'superadmin',
      role: Role.SUPERADMIN,
      businessId: 'biz_1',
      mustChangePassword: false,
    },
    businessId: 'biz_1',
  };

  it('MEMBUKTIKAN BUG AUD-INT-001: requestFinalOrder mengabaikan order.creditTotal sehingga jumlah invoice pelunasan overbilled', async () => {
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

    const mockTx: any = {
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
        findFirst: vi.fn(async ({ where }: { where: any }) => {
          if (where?.type === InvoiceType.DP) {
            return {
              id: 'inv_dp_1',
              type: InvoiceType.DP,
              status: InvoiceStatus.PAID,
            };
          }
          if (where?.status === InvoiceStatus.PENDING_APPROVAL) {
            return null; // Tidak ada invoice pending
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
        create: vi.fn(async ({ data }) => {
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
    await requestFinalOrder(mockTx, ctx, 'ord_e4_test');

    // Nilai tagihan riil yang dihitung oleh kode saat ini di src/lib/services/order.ts:1032
    // const invoiceAmount = finalGrandTotal - order.dpAmount;
    // = 1.000.000 - 300.000 = 700.000 (Overbilled Rp 200.000!)
    console.log('HASIL PERHITUNGAN AKTUAL SISTEM:', createdInvoiceAmount?.toString());

    // Ekspektasi Benar Sesuai BLUEPRINT Bagian 5 & Keputusan Pemilik:
    // Sisa tagihan pelunasan = grandTotal - DP - creditTotal = 500.000
    // Test ini SENGAJA MENGUJI nilai yang benar (500.000n) dan HARUS GAGAL saat ini!
    expect(createdInvoiceAmount).toBe(500000n);
  });
});
