import { z } from 'zod';
import { CommissionStatus } from '@prisma/client';

export const OwnerSalesNoteCreateSchema = z.object({
  note: z.string().trim().min(1, 'Catatan wajib diisi').max(5000, 'Catatan maksimal 5000 karakter'),
});

export const SalesTargetUpsertSchema = z.object({
  targetRevenue: z.number().int().min(0, 'Target omzet tidak boleh negatif'),
  targetProfit: z.number().int().min(0, 'Target profit tidak boleh negatif').default(0),
});

export const SalesPerformanceQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format bulan harus YYYY-MM')
    .optional(),
  salesId: z.string().trim().optional(),
});

export const CommissionReportQuerySchema = z.object({
  salesId: z.string().trim().optional(),
  status: z.nativeEnum(CommissionStatus).optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format bulan harus YYYY-MM')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CommissionPaySchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export type OwnerSalesNoteCreateInput = z.infer<typeof OwnerSalesNoteCreateSchema>;
export type SalesTargetUpsertInput = z.input<typeof SalesTargetUpsertSchema>;
export type SalesPerformanceQuery = z.infer<typeof SalesPerformanceQuerySchema>;
export type CommissionReportQuery = z.infer<typeof CommissionReportQuerySchema>;

