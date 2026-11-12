import { z } from 'zod';

export const CATALOG_PRESETS = ['Grosir', 'Distributor Tunggal', 'Ecer'] as const;

export const CatalogLayoutStyleEnum = z.enum([
  'TABLE',
  'PROMO_GRID',
  'HERO_SALE',
  'EDITORIAL',
]);

export const PromoValidityTypeEnum = z.enum(['NONE', 'PERIOD']);

export const CatalogItemInputSchema = z.object({
  productId: z.string().min(1, 'ID produk wajib diisi'),
  price: z.coerce.number().int().min(0, 'Harga produk tidak boleh negatif'),
  badgeText: z.string().trim().max(50).nullable().optional(),
  itemNote: z.string().trim().max(100).nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export const CreateCatalogSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Judul katalog wajib diisi')
    .max(80, 'Judul katalog maksimal 80 karakter'),
  subtitle: z.string().trim().max(150).nullable().optional(),
  promoHighlight: z.string().trim().max(100).nullable().optional(),
  layoutStyle: CatalogLayoutStyleEnum.default('TABLE'),
  isPromo: z.boolean().default(false),
  promoValidityType: PromoValidityTypeEnum.default('NONE'),
  promoStartAt: z.coerce.date().nullable().optional(),
  promoEndAt: z.coerce.date().nullable().optional(),
  validityText: z.string().trim().max(100).nullable().optional(),
  showStrikethroughPrice: z.boolean().default(false),
  showSku: z.boolean().default(true),
  ctaText: z.string().trim().max(200).nullable().optional(),
  termsNote: z.string().trim().max(2000).nullable().optional(),
  customerId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  items: z.array(CatalogItemInputSchema).default([]),
});

export const UpdateCatalogSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Judul katalog wajib diisi')
      .max(80, 'Judul katalog maksimal 80 karakter')
      .optional(),
    subtitle: z.string().trim().max(150).nullable().optional(),
    promoHighlight: z.string().trim().max(100).nullable().optional(),
    layoutStyle: CatalogLayoutStyleEnum.optional(),
    isPromo: z.boolean().optional(),
    promoValidityType: PromoValidityTypeEnum.optional(),
    promoStartAt: z.coerce.date().nullable().optional(),
    promoEndAt: z.coerce.date().nullable().optional(),
    validityText: z.string().trim().max(100).nullable().optional(),
    showStrikethroughPrice: z.boolean().optional(),
    showSku: z.boolean().optional(),
    ctaText: z.string().trim().max(200).nullable().optional(),
    termsNote: z.string().trim().max(2000).nullable().optional(),
    customerId: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export const ReplaceCatalogItemsSchema = z.object({
  items: z.array(CatalogItemInputSchema),
});

export const CatalogQuerySchema = z.object({
  search: z.string().optional(),
  customerId: z.string().optional(),
  isPromo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  layoutStyle: CatalogLayoutStyleEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
});

export type CreateCatalogInput = z.infer<typeof CreateCatalogSchema>;
export type UpdateCatalogInput = z.infer<typeof UpdateCatalogSchema>;
export type ReplaceCatalogItemsInput = z.infer<typeof ReplaceCatalogItemsSchema>;
export type CatalogQueryInput = z.infer<typeof CatalogQuerySchema>;
