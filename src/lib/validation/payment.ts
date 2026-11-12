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

export const CollectivePaymentAllocationItemSchema = z
  .object({
    invoiceId: z.string().min(1, 'Invoice ID wajib diisi'),
    amount: z.number().int().positive('Nominal alokasi harus lebih dari 0'),
  })
  .strict();

export const CollectivePaymentCreateSchema = z
  .object({
    customerId: z.string().min(1, 'Pelanggan wajib dipilih'),
    totalPaid: z
      .number()
      .int()
      .positive('Total nominal yang dibayar harus lebih dari 0'),
    creditOption: z.boolean().default(false),
    method: z.nativeEnum(PaymentMethod).default(PaymentMethod.TRANSFER),
    paidAt: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
    reference: z.string().max(100).optional().nullable(),
    proofPath: z.string().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    autoVerify: z.boolean().optional(),
    allocations: z
      .array(CollectivePaymentAllocationItemSchema)
      .min(1, 'Minimal pilih 1 faktur untuk dialokasikan'),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    let allocatedSum = 0;
    for (let i = 0; i < data.allocations.length; i++) {
      const a = data.allocations[i];
      if (seen.has(a.invoiceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['allocations', i, 'invoiceId'],
          message: 'Invoice tidak boleh dipilih lebih dari satu kali dalam satu batch',
        });
      }
      seen.add(a.invoiceId);
      allocatedSum += a.amount;
    }

    if (data.totalPaid < allocatedSum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totalPaid'],
        message: 'Total dana dibayar tidak boleh lebih kecil dari total alokasi faktur',
      });
    }
  });

export type CollectivePaymentCreateInput = z.infer<typeof CollectivePaymentCreateSchema>;
