import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { VendorKind } from '@prisma/client';

const VendorCreateSchema = z
  .object({
    kind: z.nativeEnum(VendorKind).default(VendorKind.SUPPLIER),
    code: z
      .string()
      .trim()
      .min(2, 'Kode vendor minimal 2 karakter')
      .max(30, 'Kode vendor maksimal 30 karakter')
      .transform((v) => v.toUpperCase()),
    name: z
      .string()
      .trim()
      .min(2, 'Nama vendor minimal 2 karakter')
      .max(150, 'Nama vendor maksimal 150 karakter'),
    picName: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
    bankName: z.string().trim().max(50).optional().nullable(),
    bankAccountNumber: z.string().trim().max(50).optional().nullable(),
    bankAccountHolder: z.string().trim().max(100).optional().nullable(),
    paymentTermDays: z
      .number()
      .int('Jatuh tempo harus bilangan bulat')
      .min(0, 'Jatuh tempo minimal 0 hari')
      .max(365, 'Jatuh tempo maksimal 365 hari')
      .default(0),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const GET = withApi(
  {
    roles: ['SUPERADMIN'],
  },
  async ({ ctx, req }) => {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const kind = searchParams.get('kind')?.trim();

    const businessId = ctx.businessId;
    if (!businessId) {
      throw new DomainError('NO_ACTIVE_BUSINESS', 'Unit usaha aktif belum dipilih', 400);
    }

    const where: Record<string, unknown> = {
      businessId,
      deletedAt: null,
    };

    if (kind && (kind === 'SUPPLIER' || kind === 'TRANSPORT')) {
      where.kind = kind as VendorKind;
    }

    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { picName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    return {
      data: vendors,
    };
  }
);

export const POST = withApi(
  {
    roles: ['SUPERADMIN'],
    body: VendorCreateSchema,
  },
  async ({ ctx, body }) => {
    const businessId = ctx.businessId;
    if (!businessId) {
      throw new DomainError('NO_ACTIVE_BUSINESS', 'Unit usaha aktif belum dipilih', 400);
    }

    // 1. Validasi keunikan kode vendor per unit usaha (deletedAt: null)
    const existing = await prisma.vendor.findFirst({
      where: {
        businessId,
        code: body.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new DomainError(
        'DUPLICATE',
        `Kode vendor ${body.code} sudah digunakan oleh vendor lain di unit usaha ini`,
        409
      );
    }

    // 2. Transaksi pembuatan vendor dan pencatatan audit log
    const vendor = await prisma.$transaction(async (tx) => {
      const created = await tx.vendor.create({
        data: {
          businessId,
          kind: body.kind,
          code: body.code,
          name: body.name,
          picName: body.picName || null,
          phone: body.phone || null,
          address: body.address || null,
          bankName: body.bankName || null,
          bankAccountNumber: body.bankAccountNumber || null,
          bankAccountHolder: body.bankAccountHolder || null,
          paymentTermDays: body.paymentTermDays,
          notes: body.notes || null,
        },
        include: {
          _count: {
            select: {
              products: true,
              purchaseOrders: true,
            },
          },
        },
      });

      await audit(tx, ctx, {
        action: 'VENDOR_CREATE',
        entityType: 'Vendor',
        entityId: created.id,
        businessId,
        summary: `Membuat vendor baru: [${created.code}] ${created.name} (${created.kind})`,
        after: created,
      });

      return created;
    });

    return {
      status: 201,
      data: vendor,
    };
  }
);
