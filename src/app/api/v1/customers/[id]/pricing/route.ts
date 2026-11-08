import { Role, DiscountType, DiscountSource } from '@prisma/client';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError, fromDb, Rupiah } from '@/lib/domain/money';
import { requireBusiness } from '@/lib/auth/context';
import { customerScope } from '@/lib/services/scopes';
import {
  baseFloor,
  lineFloor,
  promoPerUnit,
  isPromoActive,
  PromoRule,
} from '@/lib/domain/pricing';

export interface ApplicablePromoDto {
  id: string;
  label: string;
  source: DiscountSource;
  type: DiscountType;
  valueBps: number | null;
  valueAmount: number | null;
  discountPerUnit: Rupiah;
  floorWithPromo: Rupiah;
  validFrom: string;
  validTo: string | null;
  note: string | null;
}

export interface CustomerProductPricingDto {
  productId: string;
  productSku: string;
  productName: string;
  basePrice: Rupiah;
  defaultMinPrice: Rupiah;
  customerMinPrice: Rupiah | null;
  effectiveFloorPrice: Rupiah;
  hasCustomFloor: boolean;
  activePromos: ApplicablePromoDto[];
}

// GET /api/v1/customers/:id/pricing - Harga dasar, floor price efektif, dan promo aktif per produk
export const GET = withApi(
  {
    roles: [Role.SUPERADMIN, Role.SALES],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const scope = customerScope(ctx, businessId);

    // 1. Verifikasi pelanggan ada dan masuk scope hak akses
    const customer = await prisma.customer.findFirst({
      where: {
        ...scope,
        id: params.id,
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

    const now = new Date();

    // 2. Ambil seluruh produk aktif di unit usaha ini (TIDAK menyertakan costPrice)
    const products = await prisma.product.findMany({
      where: {
        businessId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        basePrice: true,
        minPrice: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // 3. Ambil seluruh harga minimal khusus pelanggan ini
    const customMinPrices = await prisma.customerMinPrice.findMany({
      where: {
        businessId,
        customerId: customer.id,
      },
    });
    const customMinMap = new Map(
      customMinPrices.map((cm) => [cm.productId, cm])
    );

    // 4. Ambil seluruh promo aktif untuk pelanggan ini
    const promos = await prisma.customerPromo.findMany({
      where: {
        businessId,
        customerId: customer.id,
        deletedAt: null,
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 5. Rakit DTO harga per produk
    const pricingList: CustomerProductPricingDto[] = products.map((prod) => {
      const basePrice = fromDb(prod.basePrice);
      const defaultMinPrice = fromDb(prod.minPrice);
      const customMin = customMinMap.get(prod.id);
      const customerMinPrice = customMin ? fromDb(customMin.minPrice) : null;
      const effectiveFloorPrice = baseFloor(defaultMinPrice, customerMinPrice);

      // Cari promo yang berlaku untuk produk ini
      const applicablePromos: ApplicablePromoDto[] = [];
      for (const p of promos) {
        if (
          (p.source !== 'PROMO' && p.source !== 'SUBSIDY') ||
          (p.type !== 'PERCENT' && p.type !== 'AMOUNT')
        ) {
          continue;
        }

        const rule: PromoRule = {
          id: p.id,
          label: p.label,
          source: p.source,
          type: p.type,
          valueBps: p.valueBps,
          valueAmount: p.valueAmount !== null ? fromDb(p.valueAmount) : null,
          productId: p.productId,
          validFrom: p.validFrom,
          validTo: p.validTo,
          isActive: p.isActive,
        };

        if (isPromoActive(rule, prod.id, now)) {
          const discountPerUnit = promoPerUnit(rule, basePrice);
          const floorWithPromo = lineFloor(effectiveFloorPrice, rule);

          applicablePromos.push({
            id: p.id,
            label: p.label,
            source: p.source,
            type: p.type,
            valueBps: p.valueBps,
            valueAmount: p.valueAmount !== null ? fromDb(p.valueAmount) : null,
            discountPerUnit,
            floorWithPromo,
            validFrom: p.validFrom.toISOString(),
            validTo: p.validTo ? p.validTo.toISOString() : null,
            note: p.note,
          });
        }
      }

      return {
        productId: prod.id,
        productSku: prod.sku,
        productName: prod.name,
        basePrice,
        defaultMinPrice,
        customerMinPrice,
        effectiveFloorPrice,
        hasCustomFloor: customerMinPrice !== null,
        activePromos: applicablePromos,
      };
    });

    return {
      data: {
        customer,
        pricing: pricingList,
      },
    };
  }
);
