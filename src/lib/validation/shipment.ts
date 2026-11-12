import { z } from 'zod';
import { ShipMethod } from '@prisma/client';

export const ShipmentUpsertSchema = z
  .object({
    shipmentId: z.string().trim().min(1).optional(),
    method: z.nativeEnum(ShipMethod).default(ShipMethod.OWN_FLEET),
    transporterId: z.string().trim().optional().nullable(),
    trackingNo: z.string().trim().max(100).optional().nullable(),
    driverName: z.string().trim().max(100).optional().nullable(),
    vehiclePlate: z.string().trim().max(20).optional().nullable(),
    receiverName: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    actualCost: z.number().int().min(0).optional(),
  })
  .strict();

export const ShipmentShipItemSchema = z
  .object({
    orderItemId: z.string().trim().min(1),
    qty: z.number().int().min(1),
  })
  .strict();

export const ShipmentShipSchema = z
  .object({
    shipmentId: z.string().trim().min(1).optional(),
    items: z.array(ShipmentShipItemSchema).min(1).optional(),
  })
  .strict()
  .optional();

export const ShipmentDeliverSchema = z
  .object({
    shipmentId: z.string().trim().min(1).optional(),
    receiverName: z.string().trim().max(100).optional(),
  })
  .strict()
  .optional();

export type ShipmentUpsertInput = z.infer<typeof ShipmentUpsertSchema>;
export type ShipmentShipInput = z.infer<typeof ShipmentShipSchema>;
export type ShipmentDeliverInput = z.infer<typeof ShipmentDeliverSchema>;

