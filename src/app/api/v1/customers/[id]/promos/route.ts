import { z } from 'zod';
import { Role, DiscountType, DiscountSource } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb, toDb } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { audit } from '@/lib/audit/audit';

const CreateCustomerPromoSchema = z
  .object({
    productId: z.string().optional().nullable(),
    label: z
      .string()
      .trim()
      .min(2, 'Nama/label promo minimal 2 karakter')
      .max(150, 'Nama/label promo maksimal 150 karakter'),
    source: z.nativeEnum(DiscountSource, {
      errorMap: () => ({ message: 'Sumber diskon harus PROMO atau SUBSIDY' }),
    }),
    type: z.nativeEnum(DiscountType, {
      errorMap: () => ({ message: 'Tipe diskon harus PERCENT atau AMOUNT' }),
    }),
    valueBps: z.number().int().min(1).max(10000).optional().nullable(),
    valueAmount: z.number().int().min(1).optional().nullable(),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date().optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.type === DiscountType.PERCENT) {
        return (
          typeof data.valueBps === 'number' &&
          data.valueBps > 0 &&
          data.valueBps <= 10000
        );
      }
      if (data.type === DiscountType.AMOUNT) {
        return typeof data.valueAmount === 'number' && data.valueAmount > 0;
      }
      return false;
    },
    {
      message:
        'Nilai diskon tidak valid (valueBps untuk PERCENT, valueAmount untuk AMOUNT)',
    }
  );

// GET /api/v1/customers/:id/promos - Daftar seluruh promo yang dimiliki pelanggan
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    const promos = await prisma.customerPromo.findMany({
      where: {
        businessId,
        customerId: customer.id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Ambil nama produk untuk promo yang terikat produk tertentu
    const productIds = promos
      .map((p) => p.productId)
      .filter((id): id is string => id !== null);
    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, sku: true, name: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const now = new Date();
    const data = promos.map((p) => {
      const isExpired = p.validTo !== null && p.validTo < now;
      const isPending = p.validFrom > now;
      let statusLabel: 'AKTIF' | 'KEDALUWARSA' | 'MENDATANG' | 'NONAKTIF' =
        'AKTIF';
      if (!p.isActive) statusLabel = 'NONAKTIF';
      else if (isExpired) statusLabel = 'KEDALUWARSA';
      else if (isPending) statusLabel = 'MENDATANG';

      const prod = p.productId ? productMap.get(p.productId) : null;

      return {
        id: p.id,
        customerId: p.customerId,
        productId: p.productId,
        productSku: prod?.sku || null,
        productName: prod?.name || 'Semua Produk',
        label: p.label,
        source: p.source,
        type: p.type,
        valueBps: p.valueBps,
        valueAmount: p.valueAmount !== null ? fromDb(p.valueAmount) : null,
        validFrom: p.validFrom.toISOString(),
        validTo: p.validTo ? p.validTo.toISOString() : null,
        isActive: p.isActive,
        statusLabel,
        note: p.note,
        createdAt: p.createdAt.toISOString(),
      };
    });

    return {
      data,
    };
  }
);

// POST /api/v1/customers/:id/promos - Tambah promo / subsidi baru untuk pelanggan
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: CreateCustomerPromoSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new DomainError('NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    // Jika promo untuk produk tertentu, verifikasi produk ada
    if (body.productId) {
      const product = await prisma.product.findFirst({
        where: {
          id: body.productId,
          businessId,
          deletedAt: null,
        },
      });

      if (!product) {
        throw new DomainError('NOT_FOUND', 'Produk tidak ditemukan', 404);
      }
    }

    // Validasi rentang tanggal
    if (body.validTo && body.validTo < body.validFrom) {
      throw new DomainError(
        'INVALID_DATE_RANGE',
        'Tanggal selesai promo tidak boleh lebih awal dari tanggal mulai',
        422
      );
    }

    const promo = await prisma.customerPromo.create({
      data: {
        businessId,
        customerId: customer.id,
        productId: body.productId ?? null,
        label: body.label,
        source: body.source,
        type: body.type,
        valueBps: body.type === DiscountType.PERCENT ? body.valueBps : null,
        valueAmount:
          body.type === DiscountType.AMOUNT && body.valueAmount
            ? toDb(body.valueAmount)
            : null,
        validFrom: body.validFrom,
        validTo: body.validTo ?? null,
        isActive: true,
        note: body.note ?? null,
      },
    });

    await audit(prisma, ctx, {
      action: 'CUSTOMER_PROMO_CREATE',
      entityType: 'CustomerPromo',
      entityId: promo.id,
      businessId,
      summary: `Buat promo "${promo.label}" (${promo.source} ${promo.type}) untuk customer ${customer.name}`,
      after: promo,
    });

    return {
      status: 201,
      data: {
        ...promo,
        valueAmount:
          promo.valueAmount !== null ? fromDb(promo.valueAmount) : null,
      },
    };
  }
);
