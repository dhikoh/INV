import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { ShipmentUpsertSchema } from '@/lib/validation/shipment';
import {
  getShipment,
  upsertShipment,
  TxClient,
} from '@/lib/services/shipment';

/**
 * GET /api/v1/orders/:id/shipment
 * Role: SUPERADMIN & SALES (pemilik order)
 *
 * Mengambil detail informasi pengiriman pesanan.
 * - Garansi Mutlak: actualCost tidak dikirimkan ke Sales!
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return getShipment(tx as unknown as TxClient, ctx, id);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

/**
 * POST /api/v1/orders/:id/shipment
 * Role: SUPERADMIN & SALES (pemilik order)
 *
 * Membuat atau memperbarui data logistik pengiriman pesanan (PREPARING).
 * - Sales dilarang menyertakan actualCost (422 UNPROCESSABLE_ENTITY).
 * - Status order harus IN_PROCESS, FINAL_PENDING_APPROVAL, atau AWAITING_FINAL_PAYMENT.
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: ShipmentUpsertSchema,
  },
  async ({ ctx, params, body }) => {
    requireBusiness(ctx);
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      return upsertShipment(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

