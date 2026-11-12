import { describe, it, expect, vi } from 'vitest';
import { OrderStatus, PaymentMethod, Role } from '@prisma/client';
import { CollectivePaymentCreateSchema } from '@/lib/validation/payment';
import {
  buildCrmTaskWaMessage,
  buildInvoiceWaMessage,
  buildRepeatReminderWaMessage,
  buildWaShareUrl,
  buildWaUrl,
  normalizeWaPhone,
} from '@/lib/domain/whatsapp';
import { getCustomerTransactionPrices } from '@/lib/services/customerPricingHistory';
import { assertNoSecretKeys } from '../helpers/leak';
import type { Ctx } from '@/lib/auth/context';

describe('Fase 5 Unit Tests — Pembayaran Kolektif, WhatsApp Helper, & Riwayat Harga Transaksi', () => {
  describe('CollectivePaymentCreateSchema', () => {
    it('menerima payload valid dengan alokasi multi-faktur dan kelebihan bayar', () => {
      const parsed = CollectivePaymentCreateSchema.safeParse({
        customerId: 'cust_1',
        totalPaid: 550_000,
        creditOption: true,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00.000Z',
        reference: 'TRF-1112',
        allocations: [
          { invoiceId: 'inv_1', amount: 200_000 },
          { invoiceId: 'inv_2', amount: 300_000 },
        ],
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.totalPaid).toBe(550_000);
        expect(parsed.data.allocations).toHaveLength(2);
      }
    });

    it('menolak jika totalPaid lebih kecil dari jumlah alokasi faktur', () => {
      const parsed = CollectivePaymentCreateSchema.safeParse({
        customerId: 'cust_1',
        totalPaid: 450_000,
        creditOption: false,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00.000Z',
        allocations: [
          { invoiceId: 'inv_1', amount: 200_000 },
          { invoiceId: 'inv_2', amount: 300_000 },
        ],
      });

      expect(parsed.success).toBe(false);
    });

    it('menolak duplicate invoiceId dalam satu batch', () => {
      const parsed = CollectivePaymentCreateSchema.safeParse({
        customerId: 'cust_1',
        totalPaid: 400_000,
        creditOption: false,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00.000Z',
        allocations: [
          { invoiceId: 'inv_1', amount: 200_000 },
          { invoiceId: 'inv_1', amount: 200_000 },
        ],
      });

      expect(parsed.success).toBe(false);
    });

    it('menolak nominal alokasi 0 atau negatif', () => {
      const parsed = CollectivePaymentCreateSchema.safeParse({
        customerId: 'cust_1',
        totalPaid: 100_000,
        creditOption: false,
        method: PaymentMethod.TRANSFER,
        paidAt: '2026-11-12T10:00:00.000Z',
        allocations: [{ invoiceId: 'inv_1', amount: 0 }],
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe('WhatsApp Pre-filled URL Helpers', () => {
    it('menormalkan format nomor telepon Indonesia & internasional', () => {
      expect(normalizeWaPhone('0812-3456-7890')).toBe('6281234567890');
      expect(normalizeWaPhone('+62 812 9988 7766')).toBe('6281299887766');
      expect(normalizeWaPhone(null)).toBe('');
    });

    it('membentuk tautan wa.me ber-parameter teks terenkode', () => {
      expect(buildWaUrl('0812345678', 'Halo BentoCat')).toBe(
        'https://wa.me/62812345678?text=Halo%20BentoCat'
      );
      expect(buildWaUrl('', 'Halo')).toBeNull();
      expect(buildWaShareUrl('Faktur #INV-01')).toBe(
        'https://wa.me/?text=Faktur%20%23INV-01'
      );
    });

    it('membentuk template pesan pengingat repeat, CRM task, dan faktur resmi', () => {
      const remMsg = buildRepeatReminderWaMessage({
        customerName: 'Petshop Harmoni',
        intervalDays: 14,
        lastOrderDate: '2026-10-28T00:00:00.000Z',
      });
      expect(remMsg).toContain('Petshop Harmoni');
      expect(remMsg).toContain('14 hari');

      const taskMsg = buildCrmTaskWaMessage({
        customerName: 'Petshop Harmoni',
        taskTitle: 'Follow up penawaran kupon Oktober',
      });
      expect(taskMsg).toContain('Follow up penawaran kupon Oktober');

      const invMsg = buildInvoiceWaMessage({
        customerName: 'Petshop Harmoni',
        invoiceNumber: 'INV-2026-0001',
        type: 'FINAL',
        remainingAmount: 250_000,
        grandTotal: 500_000,
        verifyUrl: 'https://app.example/verify/tok123',
      });
      expect(invMsg).toContain('Faktur Penjualan Resmi #INV-2026-0001');
      expect(invMsg).toContain('verify/tok123');
    });
  });

  describe('getCustomerTransactionPrices Zero-Leakage & Role Scope', () => {
    function createMockDb(salesId = 'sales_1') {
      return {
        customer: {
          findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
            if (where.assignedSalesId && where.assignedSalesId !== salesId) {
              return null;
            }
            return { id: 'cust_1' };
          }),
        },
        order: {
          findMany: vi.fn(async () => [
            {
              id: 'ord_1',
              orderNo: 'SO-2026-0001',
              orderDate: new Date('2026-11-01T08:00:00.000Z'),
              status: OrderStatus.COMPLETED,
              salesId: 'sales_1',
              items: [
                {
                  id: 'oi_1',
                  productId: 'prod_1',
                  sku: 'BC-01',
                  productName: 'BentoCat Salmon 10kg',
                  unit: 'Zak',
                  qty: 10,
                  listPrice: BigInt(100_000),
                  unitPrice: BigInt(95_000),
                  discountType: 'NONE',
                  discountSource: 'NONE',
                  lineDiscount: BigInt(0),
                  lineNet: BigInt(950_000),
                },
              ],
            },
          ]),
        },
        user: {
          findMany: vi.fn(async () => [{ id: 'sales_1', name: 'Andi Sales' }]),
        },
      };
    }

    it('mengembalikan riwayat harga untuk Role.SALES & Role.SUPERADMIN tanpa kebocoran HPP/margin/profit', async () => {
      const mockDb = createMockDb('sales_1');
      const salesCtx: Ctx = {
        user: {
          id: 'sales_1',
          name: 'Andi Sales',
          role: Role.SALES,
          businessId: 'biz_1',
        },
        role: Role.SALES,
        businessId: 'biz_1',
        sessionId: 'sess_1',
        ip: '127.0.0.1',
      };
      const adminCtx: Ctx = {
        user: {
          id: 'sa_1',
          name: 'Super Admin',
          role: Role.SUPERADMIN,
          businessId: 'biz_1',
        },
        role: Role.SUPERADMIN,
        businessId: 'biz_1',
        sessionId: 'sess_2',
        ip: '127.0.0.1',
      };

      const salesRows = await getCustomerTransactionPrices(
        mockDb as unknown as Parameters<typeof getCustomerTransactionPrices>[0],
        salesCtx,
        'cust_1'
      );
      expect(salesRows).toHaveLength(1);
      expect(salesRows[0].effectiveUnitPrice).toBe(95_000);
      expect(salesRows[0].salesName).toBe('Andi Sales');
      assertNoSecretKeys(salesRows, 'sales-transaction-prices');

      const adminRows = await getCustomerTransactionPrices(
        mockDb as unknown as Parameters<typeof getCustomerTransactionPrices>[0],
        adminCtx,
        'cust_1'
      );
      expect(adminRows).toHaveLength(1);
      assertNoSecretKeys(adminRows, 'admin-transaction-prices');
    });

    it('memblokir Role.SALES jika pelanggan bukan binaannya (404 NOT_FOUND)', async () => {
      const mockDb = createMockDb('sales_other');
      const salesCtx: Ctx = {
        user: {
          id: 'sales_1',
          name: 'Andi Sales',
          role: Role.SALES,
          businessId: 'biz_1',
        },
        role: Role.SALES,
        businessId: 'biz_1',
        sessionId: 'sess_1',
        ip: '127.0.0.1',
      };

      await expect(
        getCustomerTransactionPrices(
          mockDb as unknown as Parameters<typeof getCustomerTransactionPrices>[0],
          salesCtx,
          'cust_1'
        )
      ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    });
  });
});
