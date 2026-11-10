import { prisma } from '@/lib/db';
import { Ctx } from '@/lib/auth/context';
import { DomainError, fromDb } from '@/lib/domain/money';
import { effectiveFloor } from '@/lib/domain/pricing';
import { customerScope } from './scopes';
import { priceListItemDto, PriceListItemDto } from '../dto/priceList';
import { ProductWithImages } from '../dto/product';

export interface PriceListFilterInput {
  customerId?: string;
  categoryId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: 'name:asc' | 'name:desc' | 'sku:asc' | 'basePrice:asc' | 'basePrice:desc';
}

/**
 * Service untuk menyajikan daftar harga resmi (katalog & paten) bagi Sales & Super Admin.
 * Mengisolasi data usaha sesi, mengevaluasi floorPrice per customer, dan bebas kebocoran HPP.
 */
export async function listPriceList(
  ctx: Ctx,
  businessId: string,
  q: PriceListFilterInput
): Promise<{ items: PriceListItemDto[]; total: number }> {
  let customerId: string | null = null;
  if (q.customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: q.customerId, ...customerScope(ctx, businessId) },
      select: { id: true },
    });
    if (!c) {
      throw new DomainError('NOT_FOUND', 'Data tidak ditemukan', 404);
    }
    customerId = c.id;
  }

  const where = {
    businessId,
    isActive: true,
    deletedAt: null,
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { sku: { contains: q.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  const sort = q.sort ?? 'name:asc';

  const [field, dir] = sort.split(':') as [
    'name' | 'sku' | 'basePrice',
    'asc' | 'desc',
  ];

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { [field]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  // Muat CustomerMinPrice dalam 1 query untuk seluruh produk pada halaman ini
  const mins =
    customerId && rows.length > 0
      ? await prisma.customerMinPrice.findMany({
          where: {
            businessId,
            customerId,
            productId: { in: rows.map((r) => r.id) },
          },
        })
      : [];

  const byProduct = new Map(mins.map((m) => [m.productId, fromDb(m.minPrice)]));

  const items = rows.map((p) =>
    priceListItemDto(
      p as unknown as ProductWithImages,
      effectiveFloor(fromDb(p.minPrice), byProduct.get(p.id) ?? null)
    )
  );

  return { items, total };
}
