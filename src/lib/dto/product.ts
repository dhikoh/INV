import { Role } from '@prisma/client';
import { fromDb } from '../domain/money';

export interface ProductImageRecord {
  id: string;
  path: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductWithImages {
  id: string;
  sku: string;
  name: string;
  unit: string;
  description: string | null;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  costPrice: bigint;
  basePrice: bigint;
  minPrice: bigint;
  stockQty: number;
  reservedQty: number;
  minStockAlert: number;
  defaultVendorId: string | null;
  defaultVendor?: { id: string; name: string; code: string } | null;
  isActive: boolean;
  rev: number;
  images?: ProductImageRecord[];
}

export function primaryImageUrl(p: ProductWithImages): string | null {
  if (!p.images || p.images.length === 0) return null;
  const primary = p.images.find((img) => img.isPrimary) || p.images[0];
  return `/api/v1/files/${primary.path}`;
}

// DTO untuk Sales: tidak memuat HPP, margin, atau field rahasia apapun (Seksi 10.3)
export function productDtoSales(p: ProductWithImages) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    description: p.description,
    categoryId: p.categoryId,
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    basePrice: fromDb(p.basePrice),
    minPrice: fromDb(p.minPrice),
    available: p.stockQty - p.reservedQty,
    isActive: p.isActive,
    imageUrl: primaryImageUrl(p),
  };
}

// DTO untuk Super Admin: menyertakan HPP, margin Rupiah, margin bps, dan data internal (Seksi 10.3)
export function productDtoAdmin(p: ProductWithImages) {
  const cost = fromDb(p.costPrice);
  const base = fromDb(p.basePrice);
  return {
    ...productDtoSales(p),
    costPrice: cost,
    marginAmount: base - cost,
    marginBps:
      base > 0 ? Math.round(((base - cost) * 10000) / base) : 0,
    stockQty: p.stockQty,
    reservedQty: p.reservedQty,
    minStockAlert: p.minStockAlert,
    defaultVendorId: p.defaultVendorId,
    defaultVendor: p.defaultVendor
      ? {
          id: p.defaultVendor.id,
          name: p.defaultVendor.name,
          code: p.defaultVendor.code,
        }
      : null,
    rev: p.rev,
  };
}

export function productDetailDtoSales(p: ProductWithImages) {
  return {
    ...productDtoSales(p),
    images: (p.images || []).map((img) => ({
      id: img.id,
      path: img.path,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
      url: `/api/v1/files/${img.path}`,
    })),
  };
}

export function productDetailDtoAdmin(p: ProductWithImages) {
  return {
    ...productDtoAdmin(p),
    images: (p.images || []).map((img) => ({
      id: img.id,
      path: img.path,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
      url: `/api/v1/files/${img.path}`,
    })),
  };
}

export const productDto = (p: ProductWithImages, role: Role) =>
  role === 'SUPERADMIN' ? productDtoAdmin(p) : productDtoSales(p);

export const productDetailDto = (p: ProductWithImages, role: Role) =>
  role === 'SUPERADMIN' ? productDetailDtoAdmin(p) : productDetailDtoSales(p);
