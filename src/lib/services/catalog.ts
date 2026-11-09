import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { Role, InvoiceTheme, Prisma } from '@prisma/client';
import { Ctx, requireBusiness } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/money';
import { baseFloor } from '@/lib/domain/pricing';
import { getLogoDataUri } from '@/lib/pdf/logo';
import { renderReactToHtml, renderHtmlToPdf } from '@/lib/pdf/engine';
import { CatalogDocument, CatalogPdfItem, CatalogPdfData } from '@/lib/pdf/CatalogDocument';
import { env } from '@/lib/env';
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CatalogItemInput {
  productId: string;
  price: number;
  sortOrder?: number;
}

export interface CreateCatalogInput {
  title: string;
  customerId?: string | null;
  note?: string | null;
  items?: CatalogItemInput[];
}

export interface UpdateCatalogInput {
  title?: string;
  customerId?: string | null;
  note?: string | null;
}

export interface CatalogQueryInput {
  search?: string;
  customerId?: string;
  page?: number;
  limit?: number;
}

export interface PriceViolation {
  productId: string;
  name: string;
  currentPrice?: number;
  floorPrice: number;
}

export function sanitizeFilename(title: string): string {
  return title
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Mengubah berkas gambar produk lokal menjadi Data URI JPEG maksimal 300 px (Seksi 15.2).
 */
export async function getProductImageDataUri(
  imagePath: string | null | undefined
): Promise<string | null> {
  if (!imagePath) return null;

  try {
    const baseUploadDir = path.resolve(env.UPLOAD_DIR);
    const fullPath = path.resolve(baseUploadDir, imagePath);

    if (!fullPath.startsWith(baseUploadDir + path.sep)) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const resizedBuffer = await sharp(fullPath)
      .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * 1. Mengambil daftar katalog dengan filter dan paginasi (Seksi 15.1 & Seksi 10).
 */
export async function listCatalogs(ctx: Ctx, query: CatalogQueryInput) {
  const businessId = requireBusiness(ctx);
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  // Staf Sales hanya melihat katalog miliknya sendiri (ownerId = ctx.user.id)
  const where: Prisma.CatalogWhereInput = {
    businessId,
    deletedAt: null,
  };

  if (ctx.user.role === Role.SALES) {
    where.ownerId = ctx.user.id;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.search && query.search.trim().length > 0) {
    const q = query.search.trim();
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { note: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, catalogs] = await Promise.all([
    prisma.catalog.count({ where }),
    prisma.catalog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { items: true },
        },
      },
    }),
  ]);

  // Muat customer dan owner user
  const customerIds = Array.from(
    new Set(catalogs.map((c) => c.customerId).filter((id): id is string => Boolean(id)))
  );
  const ownerIds = Array.from(new Set(catalogs.map((c) => c.ownerId)));

  const [customers, owners] = await Promise.all([
    customerIds.length > 0
      ? prisma.customer.findMany({
          where: { id: { in: customerIds }, businessId },
          select: { id: true, code: true, name: true },
        })
      : [],
    ownerIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  const items = catalogs.map((c) => {
    const customer = c.customerId ? customerMap.get(c.customerId) ?? null : null;
    const owner = ownerMap.get(c.ownerId) ?? { id: c.ownerId, name: 'Sales' };

    return {
      id: c.id,
      title: c.title,
      note: c.note,
      customerId: c.customerId,
      customer,
      ownerId: c.ownerId,
      ownerName: owner.name,
      itemCount: c._count.items,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * 2. Mengambil detail katalog beserta evaluasi harga dasar & status kedaluwarsa (stale).
 */
export async function getCatalogById(ctx: Ctx, id: string) {
  const businessId = requireBusiness(ctx);

  const catalog = await prisma.catalog.findFirst({
    where: {
      id,
      businessId,
      deletedAt: null,
    },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!catalog) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  // Isolasi kepemilikan Sales
  if (ctx.user.role === Role.SALES && catalog.ownerId !== ctx.user.id) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  // Muat customer jika ada
  let customer: { id: string; code: string; name: string } | null = null;
  if (catalog.customerId) {
    customer = await prisma.customer.findFirst({
      where: { id: catalog.customerId, businessId },
      select: { id: true, code: true, name: true },
    });
  }

  // Muat owner user
  const owner = await prisma.user.findUnique({
    where: { id: catalog.ownerId },
    select: { id: true, name: true },
  });

  // Muat produk untuk setiap item katalog
  const productIds = catalog.items.map((i) => i.productId);
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds }, businessId },
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            basePrice: true,
            minPrice: true,
            deletedAt: true,
            images: {
              where: { isPrimary: true },
              select: { path: true },
              take: 1,
            },
          },
        })
      : [];

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Muat CustomerMinPrice jika katalog terikat customer
  const customerMinMap = new Map<string, number>();
  if (catalog.customerId && productIds.length > 0) {
    const custMins = await prisma.customerMinPrice.findMany({
      where: {
        businessId,
        customerId: catalog.customerId,
        productId: { in: productIds },
      },
    });
    for (const cm of custMins) {
      customerMinMap.set(cm.productId, Number(cm.minPrice));
    }
  }

  let hasStaleItems = false;
  const staleItems: PriceViolation[] = [];

  const items = catalog.items.map((item) => {
    const prod = productMap.get(item.productId);
    const itemPrice = Number(item.price);

    if (!prod) {
      return {
        id: item.id,
        productId: item.productId,
        name: 'Produk Telah Dihapus',
        sku: '-',
        unit: '-',
        price: itemPrice,
        floorPrice: 0,
        basePrice: 0,
        isStale: false,
        isDeleted: true,
        imagePath: null,
      };
    }

    const custMin = customerMinMap.get(prod.id) ?? null;
    const floor = baseFloor(Number(prod.minPrice), custMin);
    const isStale = itemPrice < floor;

    if (isStale) {
      hasStaleItems = true;
      staleItems.push({
        productId: prod.id,
        name: prod.name,
        currentPrice: itemPrice,
        floorPrice: floor,
      });
    }

    const isDeleted = prod.deletedAt !== null;
    const primaryImg = prod.images[0]?.path ?? null;

    return {
      id: item.id,
      productId: prod.id,
      name: prod.name,
      sku: prod.sku,
      unit: prod.unit,
      price: itemPrice,
      floorPrice: floor,
      basePrice: Number(prod.basePrice),
      isStale,
      isDeleted,
      imagePath: primaryImg,
    };
  });

  return {
    id: catalog.id,
    title: catalog.title,
    note: catalog.note,
    customerId: catalog.customerId,
    customer,
    ownerId: catalog.ownerId,
    ownerName: owner?.name || 'Sales',
    hasStaleItems,
    staleItems,
    items,
    createdAt: catalog.createdAt.toISOString(),
    updatedAt: catalog.updatedAt.toISOString(),
  };
}

/**
 * Validasi baris item katalog terhadap harga dasar / floor minimal (Seksi 15.1).
 */
export async function validateCatalogItems(
  tx: TxClient,
  businessId: string,
  customerId: string | null | undefined,
  items: CatalogItemInput[]
): Promise<void> {
  if (items.length === 0) return;

  const productIds = items.map((i) => i.productId);
  const uniqueProductIds = new Set(productIds);
  if (uniqueProductIds.size !== productIds.length) {
    throw new DomainError('DUPLICATE_PRODUCT', 'Satu produk hanya boleh dimasukkan satu kali per katalog', 422);
  }

  // Hanya produk aktif yang bisa dimasukkan
  const products = await tx.product.findMany({
    where: {
      id: { in: productIds },
      businessId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      minPrice: true,
    },
  });

  if (products.length !== productIds.length) {
    throw new DomainError('PRODUCT_NOT_FOUND', 'Satu atau lebih produk tidak ditemukan atau tidak aktif', 404);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Muat customer min price bila customer terhubung
  const customerMinMap = new Map<string, number>();
  if (customerId) {
    const custMins = await tx.customerMinPrice.findMany({
      where: {
        businessId,
        customerId,
        productId: { in: productIds },
      },
    });
    for (const cm of custMins) {
      customerMinMap.set(cm.productId, Number(cm.minPrice));
    }
  }

  const violations: PriceViolation[] = [];
  for (const item of items) {
    const prod = productMap.get(item.productId)!;
    const custMin = customerMinMap.get(item.productId) ?? null;
    const floor = baseFloor(Number(prod.minPrice), custMin);

    if (item.price < floor) {
      violations.push({
        productId: prod.id,
        name: prod.name,
        currentPrice: item.price,
        floorPrice: floor,
      });
    }
  }

  if (violations.length > 0) {
    throw new DomainError(
      'PRICE_BELOW_MIN',
      'Harga produk tidak boleh di bawah harga minimal',
      422,
      violations
    );
  }
}

/**
 * 3. Membuat katalog baru dengan validasi harga floor (Seksi 15.1).
 */
export async function createCatalog(ctx: Ctx, input: CreateCatalogInput) {
  const businessId = requireBusiness(ctx);

  // Jika customer diisi, pastikan customer ada dan terisolasi
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: input.customerId,
        businessId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    if (ctx.user.role === Role.SALES && customer.assignedSalesId !== ctx.user.id) {
      throw new DomainError('FORBIDDEN', 'Pelanggan bukan milik Anda', 403);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Validasi harga seluruh item
    if (input.items && input.items.length > 0) {
      await validateCatalogItems(tx, businessId, input.customerId, input.items);
    }

    const catalog = await tx.catalog.create({
      data: {
        businessId,
        ownerId: ctx.user.id,
        customerId: input.customerId || null,
        title: input.title,
        note: input.note || null,
      },
    });

    if (input.items && input.items.length > 0) {
      await tx.catalogItem.createMany({
        data: input.items.map((i, idx) => ({
          catalogId: catalog.id,
          productId: i.productId,
          price: BigInt(i.price),
          sortOrder: i.sortOrder ?? idx,
        })),
      });
    }

    return catalog;
  });
}

/**
 * 4. Memperbarui metadata katalog (judul, customer, catatan).
 */
export async function updateCatalog(ctx: Ctx, id: string, input: UpdateCatalogInput) {
  const businessId = requireBusiness(ctx);

  const existing = await prisma.catalog.findFirst({
    where: { id, businessId, deletedAt: null },
  });

  if (!existing) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && existing.ownerId !== ctx.user.id) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: input.customerId,
        businessId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan', 404);
    }

    if (ctx.user.role === Role.SALES && customer.assignedSalesId !== ctx.user.id) {
      throw new DomainError('FORBIDDEN', 'Pelanggan bukan milik Anda', 403);
    }
  }

  await prisma.catalog.updateMany({
    where: { id, businessId },
    data: {
      title: input.title !== undefined ? input.title : existing.title,
      customerId: input.customerId !== undefined ? input.customerId : existing.customerId,
      note: input.note !== undefined ? input.note : existing.note,
    },
  });

  return getCatalogById(ctx, id);
}

/**
 * 5. Mengganti seluruh item dalam katalog dengan validasi floor (Seksi 15.1).
 */
export async function replaceCatalogItems(
  ctx: Ctx,
  id: string,
  items: CatalogItemInput[]
) {
  const businessId = requireBusiness(ctx);

  const existing = await prisma.catalog.findFirst({
    where: { id, businessId, deletedAt: null },
  });

  if (!existing) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && existing.ownerId !== ctx.user.id) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  await prisma.$transaction(async (tx) => {
    // Validasi harga seluruh item
    await validateCatalogItems(tx, businessId, existing.customerId, items);

    // Hapus item lama
    await tx.catalogItem.deleteMany({
      where: { catalogId: id },
    });

    // Masukkan item baru
    if (items.length > 0) {
      await tx.catalogItem.createMany({
        data: items.map((i, idx) => ({
          catalogId: id,
          productId: i.productId,
          price: BigInt(i.price),
          sortOrder: i.sortOrder ?? idx,
        })),
      });
    }
  });

  return getCatalogById(ctx, id);
}

/**
 * 6. Menyesuaikan seluruh item yang kedaluwarsa/stale ke harga minimal terkini (Seksi 15.1).
 */
export async function adjustCatalogToMinPrice(ctx: Ctx, id: string) {
  const businessId = requireBusiness(ctx);

  const catalog = await prisma.catalog.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { items: true },
  });

  if (!catalog) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && catalog.ownerId !== ctx.user.id) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  const productIds = catalog.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId },
    select: { id: true, minPrice: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const customerMinMap = new Map<string, number>();
  if (catalog.customerId && productIds.length > 0) {
    const custMins = await prisma.customerMinPrice.findMany({
      where: {
        businessId,
        customerId: catalog.customerId,
        productId: { in: productIds },
      },
    });
    for (const cm of custMins) {
      customerMinMap.set(cm.productId, Number(cm.minPrice));
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of catalog.items) {
      const prod = productMap.get(item.productId);
      if (!prod) continue;

      const custMin = customerMinMap.get(prod.id) ?? null;
      const floor = baseFloor(Number(prod.minPrice), custMin);

      if (Number(item.price) < floor) {
        await tx.catalogItem.updateMany({
          where: { id: item.id, catalogId: id },
          data: { price: BigInt(floor) },
        });
      }
    }
  });

  return getCatalogById(ctx, id);
}

/**
 * 7. Menghapus (soft delete) katalog.
 */
export async function deleteCatalog(ctx: Ctx, id: string) {
  const businessId = requireBusiness(ctx);

  const existing = await prisma.catalog.findFirst({
    where: { id, businessId, deletedAt: null },
  });

  if (!existing) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  if (ctx.user.role === Role.SALES && existing.ownerId !== ctx.user.id) {
    throw new DomainError('NOT_FOUND', 'Katalog tidak ditemukan', 404);
  }

  await prisma.catalog.updateMany({
    where: { id, businessId },
    data: { deletedAt: new Date() },
  });

  return { success: true };
}

/**
 * 8. Menghasilkan berkas PDF Katalog resmi (Seksi 15.2 & Tes 17.3 nomor 18).
 *
 * Pemeriksaan Keras:
 * - Ditolak 422 CATALOG_STALE jika ada item di bawah harga minimal terbaru.
 * - Produk nonaktif/dihapus tidak diikutkan di PDF.
 * - Maksimal 300 produk per PDF.
 * - Dilarang menampilkan HPP (costPrice), harga minimal (minPrice), atau stok!
 */
export async function generateCatalogPdf(
  ctx: Ctx,
  id: string
): Promise<{ buffer: Buffer; filename: string }> {
  const detail = await getCatalogById(ctx, id);

  // Jika ada item stale di bawah floor -> TOLAK 422 CATALOG_STALE (Tes 17.3 nomor 18)
  if (detail.hasStaleItems) {
    throw new DomainError(
      'CATALOG_STALE',
      'Katalog memuat produk dengan harga di bawah harga minimal terbaru',
      422,
      detail.staleItems
    );
  }

  // Filter hanya produk aktif (yang belum dihapus)
  const activeItems = detail.items.filter((i) => !i.isDeleted);

  // Batasi maksimal 300 produk per PDF (Seksi 15.2)
  const renderItems = activeItems.slice(0, 300);

  // Muat data profil usaha & tema
  const business = await prisma.business.findFirst({
    where: { id: ctx.businessId! },
    select: {
      id: true,
      name: true,
      legalName: true,
      address: true,
      phone: true,
      email: true,
      logoPath: true,
      ppnEnabled: true,
      invoiceTheme: true,
    },
  });

  if (!business) {
    throw new DomainError('BUSINESS_NOT_FOUND', 'Data usaha tidak ditemukan', 404);
  }

  const logoDataUri = getLogoDataUri(business.logoPath);

  // Ubah foto produk menjadi data URI 300 px secara paralel
  const pdfItems: CatalogPdfItem[] = await Promise.all(
    renderItems.map(async (item, idx) => {
      const imageDataUri = await getProductImageDataUri(item.imagePath);
      return {
        no: idx + 1,
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        price: item.price,
        imageDataUri,
      };
    })
  );

  const pdfData: CatalogPdfData = {
    title: detail.title,
    date: detail.updatedAt,
    note: detail.note,
    business: {
      name: business.name,
      legalName: business.legalName,
      address: business.address,
      phone: business.phone,
      email: business.email,
      ppnEnabled: business.ppnEnabled,
      invoiceTheme: business.invoiceTheme || InvoiceTheme.PROFESIONAL,
    },
    customer: detail.customer,
    items: pdfItems,
  };

  const html = renderReactToHtml(
    CatalogDocument({
      data: pdfData,
      logoDataUri,
    })
  );

  const buffer = await renderHtmlToPdf(html);

  const dateStr = new Date(detail.updatedAt).toISOString().slice(0, 10);
  const cleanTitle = sanitizeFilename(detail.title) || 'Katalog';
  const filename = `Katalog-${cleanTitle}-${dateStr}.pdf`;

  return { buffer, filename };
}
