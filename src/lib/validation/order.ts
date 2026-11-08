import { z } from 'zod';

export const OrderLineSchema = z
  .object({
    productId: z.string().min(1),
    qty: z.number().int().positive().max(1_000_000),
    unitPrice: z.number().int().min(0).max(10_000_000_000),
    discount: z
      .discriminatedUnion('source', [
        z
          .object({
            source: z.literal('MANUAL'),
            type: z.enum(['PERCENT', 'AMOUNT']),
            value: z.number().int().min(0),
          })
          .strict(),
        z
          .object({
            source: z.enum(['PROMO', 'SUBSIDY']),
            promoId: z.string().min(1),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();

export const OrderCreateSchema = z
  .object({
    customerId: z.string().min(1),
    items: z.array(OrderLineSchema).min(1).max(200),
    shippingCharge: z.number().int().min(0).default(0),
    dpBps: z.number().int().min(0).max(9900).optional(), // default dari Business.defaultDpBps
    deliveryAddress: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional(),
    repeatIntervalDays: z.number().int().min(1).max(365).optional(),
    belowMinReason: z.string().min(5).max(1000).optional(),
  })
  .strict();

export const OrderUpdateSchema = OrderCreateSchema.extend({
  rev: z.number().int().min(0),
}).strict();

export const OrderDeleteSchema = z
  .object({
    confirm: z.string().min(1),
  })
  .strict();

export type OrderLineInput = z.infer<typeof OrderLineSchema>;
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof OrderUpdateSchema>;
export type OrderDeleteInput = z.infer<typeof OrderDeleteSchema>;
