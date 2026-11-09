import { z } from 'zod';

export const CATALOG_PRESETS = ['Grosir', 'Distributor Tunggal', 'Ecer'] as const;

export const CatalogItemInputSchema = z.object({
  productId: z.string().min(1, 'ID produk wajib diisi'),
  price: z.coerce.number().int().min(0, 'Harga produk tidak boleh negatif'),
  sortOrder: z.coerce.number().int().default(0),
});

export const CreateCatalogSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Judul katalog wajib diisi')
    .max(60, 'Judul katalog maksimal 60 karakter'),
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
      .max(60, 'Judul katalog maksimal 60 karakter')
      .optional(),
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
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
});

export type CreateCatalogInput = z.infer<typeof CreateCatalogSchema>;
export type UpdateCatalogInput = z.infer<typeof UpdateCatalogSchema>;
export type ReplaceCatalogItemsInput = z.infer<typeof ReplaceCatalogItemsSchema>;
export type CatalogQueryInput = z.infer<typeof CatalogQuerySchema>;
