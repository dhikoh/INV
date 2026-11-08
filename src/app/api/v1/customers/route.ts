import { z } from 'zod';
import { Role, PipelineStage } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { customerScope } from '@/lib/services/scopes';
import { audit } from '@/lib/audit/audit';

const CreateCustomerSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Kode pelanggan minimal 2 karakter')
      .max(30, 'Kode pelanggan maksimal 30 karakter')
      .transform((v) => v.toUpperCase()),
    name: z
      .string()
      .trim()
      .min(2, 'Nama pelanggan minimal 2 karakter')
      .max(150, 'Nama pelanggan maksimal 150 karakter'),
    contactName: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
    shippingAddress: z.string().trim().max(1000).optional().nullable(),
    billingAddress: z.string().trim().max(1000).optional().nullable(),
    npwp: z.string().trim().max(50).optional().nullable(),
    assignedSalesId: z.string().optional().nullable(),
    pipelineStage: z
      .nativeEnum(PipelineStage)
      .default(PipelineStage.LEAD)
      .optional(),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Tag minimal 1 karakter')
          .max(50, 'Tag maksimal 50 karakter')
      )
      .default([])
      .optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const CustomerQuerySchema = z.object({
  q: z.string().trim().optional(),
  stage: z.nativeEnum(PipelineStage).optional(),
  tag: z.string().trim().optional(),
  salesId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /api/v1/customers - Daftar pelanggan (SA melihat semua di usaha; Sales hanya miliknya via customerScope)
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    query: CustomerQuerySchema,
  },
  async ({ ctx, query }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    const where: Record<string, unknown> = {
      ...scope,
    };

    if (query.q) {
      where.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { contactName: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.stage) {
      where.pipelineStage = query.stage;
    }

    if (query.tag) {
      where.tags = {
        has: query.tag,
      };
    }

    // Filter salesId hanya berlaku untuk Super Admin
    if (ctx.role === Role.SUPERADMIN && query.salesId) {
      where.assignedSalesId = query.salesId;
    }

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: {
          assignedSales: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          _count: {
            select: {
              orders: true,
            },
          },
        },
        orderBy: [{ name: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
);

// POST /api/v1/customers - Tambah pelanggan baru (SA + Sales, Sales otomatis assignedSalesId = dirinya)
export const POST = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
    body: CreateCustomerSchema,
  },
  async ({ ctx, body }) => {
    const businessId = requireBusiness(ctx);

    // 1. Tentukan assignedSalesId berdasarkan peran
    let assignedSalesId: string | null = null;

    if (ctx.role === Role.SALES) {
      // Sales otomatis menugaskan dirinya sendiri
      assignedSalesId = ctx.user.id;
    } else {
      // Super Admin dapat memilih sales atau null
      if (body.assignedSalesId) {
        const salesUser = await prisma.user.findFirst({
          where: {
            id: body.assignedSalesId,
            businessId,
            role: Role.SALES,
            isActive: true,
            deletedAt: null,
          },
        });

        if (!salesUser) {
          throw new DomainError(
            'VALIDATION_ERROR',
            'Staf sales yang dipilih tidak valid atau tidak aktif di unit usaha ini',
            422
          );
        }
        assignedSalesId = salesUser.id;
      }
    }

    // 2. Periksa keunikan kode customer di usaha ini
    const existing = await prisma.customer.findFirst({
      where: {
        businessId,
        code: body.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new DomainError(
        'DUPLICATE',
        `Kode pelanggan "${body.code}" sudah digunakan di unit usaha ini`,
        409
      );
    }

    // 3. Simpan data customer baru
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          businessId,
          code: body.code,
          name: body.name,
          contactName: body.contactName ?? null,
          phone: body.phone ?? null,
          address: body.address ?? null,
          shippingAddress: body.shippingAddress ?? null,
          billingAddress: body.billingAddress ?? null,
          npwp: body.npwp ?? null,
          assignedSalesId,
          pipelineStage: body.pipelineStage ?? PipelineStage.LEAD,
          tags: body.tags ?? [],
          notes: body.notes ?? null,
          rev: 0,
        },
        include: {
          assignedSales: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          _count: {
            select: {
              orders: true,
            },
          },
        },
      });

      await audit(tx, ctx, {
        action: 'CUSTOMER_CREATE',
        entityType: 'Customer',
        entityId: created.id,
        businessId,
        summary: `Mendaftarkan pelanggan baru: [${created.code}] ${created.name}`,
        after: created,
      });

      return created;
    });

    return {
      status: 201,
      data: customer,
    };
  }
);
