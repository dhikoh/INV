import { z } from 'zod';

export const OrderCostCreateSchema = z.object({
  label: z.string().trim().min(1, 'Label biaya wajib diisi'),
  amount: z.number().int().positive('Nominal biaya harus bilangan bulat positif'),
});

export type OrderCostCreateInput = z.infer<typeof OrderCostCreateSchema>;
