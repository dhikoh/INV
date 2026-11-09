import { z } from 'zod';

export const MarginReportQuerySchema = z.object({
  groupBy: z.enum(['order', 'product', 'sales', 'business']).default('order'),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  salesId: z.string().trim().optional(),
  productId: z.string().trim().optional(),
});

export type MarginReportQuery = z.infer<typeof MarginReportQuerySchema>;
