import { z } from 'zod';

export const PriceListQuery = z
  .object({
    customerId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum(['name:asc', 'name:desc', 'sku:asc', 'basePrice:asc', 'basePrice:desc'])
      .default('name:asc'),
  })
  .strict();

export type PriceListQuery = z.infer<typeof PriceListQuery>;

export const CatalogFromProductsSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    customerId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    productIds: z.array(z.string().min(1)).min(1).max(300).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type CatalogFromProductsInput = z.infer<typeof CatalogFromProductsSchema>;

export const CatalogSyncSchema = z
  .object({
    addNewProducts: z.boolean().default(false),
    raiseToFloor: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.addNewProducts || v.raiseToFloor, {
    message: 'Pilih minimal satu aksi (addNewProducts atau raiseToFloor)',
  });

export type CatalogSyncInput = z.infer<typeof CatalogSyncSchema>;

