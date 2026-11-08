import { z } from 'zod';
import { CreditSettlement } from '@prisma/client';

export const CreditNoteItemInputSchema = z.object({
  orderItemId: z.string().min(1, 'ID item pesanan wajib diisi'),
  qty: z.number().int().positive('Jumlah retur harus lebih besar dari 0'),
  restock: z.boolean().default(true),
});

export const CreditNoteCreateSchema = z.object({
  reason: z.string().min(5, 'Alasan retur minimal 5 karakter'),
  settlement: z.nativeEnum(CreditSettlement, {
    errorMap: () => ({ message: 'Metode penyelesaian kredit tidak valid (OFFSET, REFUND, atau CUSTOMER_CREDIT)' }),
  }),
  items: z
    .array(CreditNoteItemInputSchema)
    .min(1, 'Minimal satu barang harus disertakan dalam retur'),
});

export const CreditNoteVoidSchema = z.object({
  reason: z.string().min(5, 'Alasan pembatalan (void) nota kredit minimal 5 karakter'),
});

export const CreditNoteQuerySchema = z.object({
  search: z.string().optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  settlement: z.nativeEnum(CreditSettlement).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreditNoteItemInput = z.infer<typeof CreditNoteItemInputSchema>;
export type CreditNoteCreateInput = z.infer<typeof CreditNoteCreateSchema>;
export type CreditNoteVoidInput = z.infer<typeof CreditNoteVoidSchema>;
export type CreditNoteQueryInput = z.infer<typeof CreditNoteQuerySchema>;

