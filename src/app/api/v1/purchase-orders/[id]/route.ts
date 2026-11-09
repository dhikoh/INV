import { withApi } from '@/lib/api/withApi';
import { requireBusiness } from '@/lib/auth/context';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/domain/money';
import { PurchaseOrderUpdateSchema } from '@/lib/validation/purchase-order';
import {
  updatePurchaseOrder,
  formatPurchaseOrderDto,
  getProductMapForPo,
  Tx,
} from '@/lib/services/purchase-order';

/**
 * GET /api/v1/purchase-orders/:id
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Mengambil detail Purchase Order lengkap beserta rincian item produk.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const po = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        businessId,
        deletedAt: null,
      },
      include: {
        vendor: {
          select: { id: true, code: true, name: true, picName: true, phone: true, address: true },
        },
        items: true,
      },
    });

    if (!po) {
      throw new DomainError('PO_NOT_FOUND', 'Purchase Order tidak ditemukan', 404);
    }

    const prodMap = await getProductMapForPo(prisma as unknown as Tx, po.items, businessId);

    return {
      status: 200,
      data: formatPurchaseOrderDto(po, prodMap),
    };
  }
);

/**
 * PATCH /api/v1/purchase-orders/:id
 * Role: SUPERADMIN ONLY (Sales ditolak 403 FORBIDDEN)
 *
 * Memperbarui draf Purchase Order. Hanya berlaku saat status DRAFT.
 *
 * Rujukan: Seksi 7.9 & 8.3 Dokumen Spesifikasi.
 */
export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: PurchaseOrderUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const { id } = params;

    const { po, prodMap } = await prisma.$transaction(async (tx) => {
      return updatePurchaseOrder(tx, businessId, id, ctx.user.id, body);
    });

    return {
      status: 200,
      data: formatPurchaseOrderDto(po, prodMap),
    };
  }
);
