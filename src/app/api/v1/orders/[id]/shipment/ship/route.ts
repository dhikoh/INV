import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { ShipmentShipInput, ShipmentShipSchema } from '@/lib/validation/shipment';
import { shipOrder, TxClient } from '@/lib/services/shipment';

/**
 * POST /api/v1/orders/:id/shipment/ship
 * Role: SUPERADMIN & SALES (pemilik order)
 *
 * Menandai barang pesanan telah dikirim (SHIPPED) — mendukung penuh maupun kloter parsial (Fase 4).
 * - Syarat default: Order berstatus AWAITING_FINAL_PAYMENT (atau IN_PROCESS/FINAL_PENDING_APPROVAL bila allowShipBeforeFinalInvoice aktif).
 * - Bila requirePaidBeforeShip aktif: balanceDue harus 0 (tolak 409 bila belum lunas).
 * - Alokasi nomor surat jalan resmi KODE/SJ/DD/MM/YYYY/NNNN (atau -K2, -K3 untuk kloter lanjutan).
 * - Stok keluar fisik hanya sesuai qty kloter yang dikirim.
 * - Evaluasi penyelesaian otomatis (maybeComplete).
 */
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ req, ctx, params }) => {
    requireBusiness(ctx);
    const { id } = params;

    let body: ShipmentShipInput = undefined;
    const rawText = await req.text().catch(() => '');
    if (rawText.trim().length > 0) {
      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new DomainError('BAD_REQUEST', 'JSON tidak valid', 400);
      }
      body = ShipmentShipSchema.parse(json);
    }

    const result = await prisma.$transaction(async (tx) => {
      return shipOrder(tx as unknown as TxClient, ctx, id, body);
    });

    return {
      status: 200,
      data: result,
    };
  }
);

