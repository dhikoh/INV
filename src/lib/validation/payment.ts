import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const PaymentCreateSchema = z
  .object({
    orderId: z.string().min(1, 'Order ID wajib diisi'),
    invoiceId: z.string().optional().nullable(),
    amount: z.number().int().positive('Jumlah pembayaran harus lebih dari 0'),
    method: z.nativeEnum(PaymentMethod).default(PaymentMethod.TRANSFER),
    paidAt: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
    reference: z.string().max(100).optional().nullable(),
    proofPath: z.string().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    autoVerify: z.boolean().optional(),
  })
  .strict();

export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>;

export const PaymentRejectSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan penolakan pembayaran wajib minimal 5 karakter'),
  })
  .strict();

export type PaymentRejectInput = z.infer<typeof PaymentRejectSchema>;

export const PaymentVoidSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan pembatalan (void) pembayaran wajib minimal 5 karakter'),
  })
  .strict();

export type PaymentVoidInput = z.infer<typeof PaymentVoidSchema>;
