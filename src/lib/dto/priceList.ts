import { fromDb } from '../domain/money';
import { initialPrice, FloorSource } from '../domain/pricing';
import { primaryImageUrl, ProductWithImages } from './product';

export interface PriceListItemDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  categoryId: string | null;
  imageUrl: string | null;
  available: number;
  basePrice: number;
  floorPrice: number;
  floorSource: FloorSource;
  suggestedPrice: number;
}

/**
 * DTO resmi untuk respons GET /api/v1/price-list (Seksi 13.7 & Seksi 14.5).
 * Whitelist 11 kunci persis: tidak membocorkan HPP (costPrice), margin, atau stok fisik.
 */
export function priceListItemDto(
  p: ProductWithImages,
  floor: { value: number; source: FloorSource }
): PriceListItemDto {
  const base = fromDb(p.basePrice);
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    categoryId: p.categoryId,
    imageUrl: primaryImageUrl(p),
    available: p.stockQty - p.reservedQty,
    basePrice: base,
    floorPrice: floor.value,
    floorSource: floor.source,
    suggestedPrice: initialPrice(base, floor.value),
  };
}

