import { z } from 'zod';
import { CommissionStatus, CommissionMode } from '@prisma/client';

export const CommissionPaySchema = z.object({
  note: z.string().trim().optional(),
});

export const CommissionTierItemSchema = z.object({
  minAchievementBps: z.number().int().min(0, 'Minimal capaian tidak boleh negatif'),
  rateBps: z.number().int().min(0, 'Tarif komisi tidak boleh negatif').max(10000, 'Tarif maksimal 100% (10000 bps)'),
});

export const CommissionTiersUpdateSchema = z.object({
  businessId: z.string().optional(),
  tiers: z.array(CommissionTierItemSchema),
});

export const CommissionQuerySchema = z.object({
  salesId: z.string().optional(),
  status: z.nativeEnum(CommissionStatus).optional(),
  mode: z.nativeEnum(CommissionMode).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Format bulan harus YYYY-MM').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CommissionPayInput = z.infer<typeof CommissionPaySchema>;
export type CommissionTiersUpdateInput = z.infer<typeof CommissionTiersUpdateSchema>;
export type CommissionQueryInput = z.infer<typeof CommissionQuerySchema>;

