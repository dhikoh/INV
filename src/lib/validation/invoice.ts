import { z } from 'zod';
import { InvoiceTheme, InvoiceStatus, InvoiceType } from '@prisma/client';

export const InvoiceQuerySchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  type: z.nativeEnum(InvoiceType).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['date', 'issueDate', 'dueDate', 'customer', 'amount', 'number', 'status', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

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

export const InvoiceVoidSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan pembatalan (void) faktur wajib minimal 5 karakter')
      .max(1000),
  })
  .strict();

export type InvoiceApproveInput = z.infer<typeof InvoiceApproveSchema>;
export type InvoiceRejectInput = z.infer<typeof InvoiceRejectSchema>;
export type InvoiceVoidInput = z.infer<typeof InvoiceVoidSchema>;
export type InvoiceQueryInput = z.infer<typeof InvoiceQuerySchema>;
