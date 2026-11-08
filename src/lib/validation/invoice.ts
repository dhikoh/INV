import { z } from 'zod';
import { InvoiceTheme } from '@prisma/client';

export const InvoiceApproveSchema = z
  .object({
    rev: z.number().int().min(0).optional(),
    overrideNote: z.string().trim().max(1000).optional(),
    dueDate: z.string().optional(),
    theme: z.nativeEnum(InvoiceTheme).optional(),
  })
  .strict()
  .optional();

export const InvoiceRejectSchema = z
  .object({
    rev: z.number().int().min(0).optional(),
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan penolakan / revisi wajib minimal 5 karakter')
      .max(1000),
  })
  .strict();

export type InvoiceApproveInput = z.infer<typeof InvoiceApproveSchema>;
export type InvoiceRejectInput = z.infer<typeof InvoiceRejectSchema>;
