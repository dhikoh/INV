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

export const OrderSubmitSchema = z
  .object({
    belowMinReason: z.string().trim().min(5, 'Alasan harga di bawah minimal wajib minimal 5 karakter').max(1000).optional(),
  })
  .strict()
  .optional();

export const OrderRequestFinalSchema = z
  .object({
    shippingCharge: z.number().int().min(0).optional(),
    shippingReason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .optional();

export const OrderCancelSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan pembatalan wajib diisi minimal 5 karakter')
      .max(1000),
    dpSettlement: z.enum(['REFUND', 'CUSTOMER_CREDIT']).optional(),
    refundMethod: z.enum(['TRANSFER', 'CASH', 'OTHER']).optional(),
    refundReference: z.string().trim().max(150).optional(),
    rev: z.number().int().min(0).optional(),
  })
  .strict();

export const OrderRevisionCreateSchema = z
  .object({
    rev: z.number().int().min(0),
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan revisi pesanan minimal 5 karakter')
      .max(1000),
    items: z.array(OrderLineSchema).min(1).max(200),
    shippingCharge: z.number().int().min(0).default(0),
    deliveryAddress: z.string().max(1000).optional(),
    belowMinReason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict();

export const OrderRevisionApproveSchema = z
  .object({
    overrideNote: z.string().trim().max(1000).optional(),
  })
  .strict()
  .optional();

export const OrderRevisionRejectSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan penolakan revisi wajib minimal 5 karakter')
      .max(1000),
  })
  .strict();

export type OrderLineInput = z.infer<typeof OrderLineSchema>;
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof OrderUpdateSchema>;
export type OrderDeleteInput = z.infer<typeof OrderDeleteSchema>;
export type OrderSubmitInput = z.infer<typeof OrderSubmitSchema>;
export type OrderRequestFinalInput = z.infer<typeof OrderRequestFinalSchema>;
export type OrderCancelInput = z.infer<typeof OrderCancelSchema>;
export type OrderRevisionCreateInput = z.infer<typeof OrderRevisionCreateSchema>;
export type OrderRevisionApproveInput = z.infer<typeof OrderRevisionApproveSchema>;
export type OrderRevisionRejectInput = z.infer<typeof OrderRevisionRejectSchema>;

