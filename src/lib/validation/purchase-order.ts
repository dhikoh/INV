import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const PurchaseOrderItemSchema = z
  .object({
    productId: z.string().min(1, 'Produk wajib dipilih'),
    qty: z.number().int('Jumlah harus bilangan bulat').min(1, 'Kuantitas minimal 1'),
    unitCost: z
      .number()
      .int('Harga satuan harus bilangan bulat')
      .min(0, 'Harga satuan tidak boleh negatif'),
  })
  .strict();

export const PurchaseOrderCreateSchema = z
  .object({
    vendorId: z.string().min(1, 'Vendor wajib dipilih'),
    orderDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
    expectedDate: z
      .string()
      .datetime({ offset: true })
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
      .optional()
      .nullable(),
    shippingCost: z
      .number()
      .int('Ongkos kirim harus bilangan bulat')
      .min(0, 'Ongkos kirim tidak boleh negatif')
      .default(0),
    otherCost: z
      .number()
      .int('Biaya lain harus bilangan bulat')
      .min(0, 'Biaya lain tidak boleh negatif')
      .default(0),
    notes: z.string().trim().max(1000).optional().nullable(),
    items: z.array(PurchaseOrderItemSchema).min(1, 'Minimal satu baris produk'),
  })
  .strict();

export const PurchaseOrderUpdateSchema = z
  .object({
    vendorId: z.string().min(1).optional(),
    orderDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    expectedDate: z
      .string()
      .datetime({ offset: true })
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
      .optional()
      .nullable(),
    shippingCost: z.number().int().min(0).optional(),
    otherCost: z.number().int().min(0).optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    items: z.array(PurchaseOrderItemSchema).min(1).optional(),
  })
  .strict();

export const PurchaseOrderReceiveItemSchema = z
  .object({
    itemId: z.string().min(1, 'Item PO wajib dipilih'),
    qty: z.number().int('Jumlah harus bilangan bulat').min(1, 'Kuantitas terima minimal 1'),
    updateHpp: z.boolean().default(false).optional(),
  })
  .strict();

export const PurchaseOrderReceiveSchema = z
  .object({
    items: z.array(PurchaseOrderReceiveItemSchema).min(1, 'Minimal satu item diterima'),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export const PurchaseOrderCancelSchema = z
  .object({
    reason: z.string().trim().min(5, 'Alasan pembatalan PO wajib diisi minimal 5 karakter'),
  })
  .strict();

export const VendorPaymentCreateSchema = z
  .object({
    purchaseOrderId: z.string().optional().nullable(),
    amount: z.number().int('Nominal pembayaran harus bilangan bulat').min(1, 'Nominal minimal Rp 1'),
    paidAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
    method: z.nativeEnum(PaymentMethod).default(PaymentMethod.TRANSFER),
    reference: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export type PurchaseOrderCreateInput = z.input<typeof PurchaseOrderCreateSchema>;
export type PurchaseOrderUpdateInput = z.input<typeof PurchaseOrderUpdateSchema>;
export type PurchaseOrderReceiveInput = z.input<typeof PurchaseOrderReceiveSchema>;
export type PurchaseOrderCancelInput = z.input<typeof PurchaseOrderCancelSchema>;
export type VendorPaymentCreateInput = z.input<typeof VendorPaymentCreateSchema>;
