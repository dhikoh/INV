import { z } from 'zod';

export const StockAdjustSchema = z
  .object({
    productId: z.string().min(1, 'Produk wajib dipilih'),
    qtyDelta: z
      .number()
      .int('Jumlah koreksi harus berupa bilangan bulat')
      .refine((val) => val !== 0, 'Jumlah koreksi tidak boleh 0'),
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan penyesuaian stok wajib diisi minimal 5 karakter'),
  })
  .strict();

export const StockOpnameSchema = z
  .object({
    productId: z.string().min(1, 'Produk wajib dipilih'),
    countedQty: z
      .number()
      .int('Jumlah fisik harus berupa bilangan bulat')
      .min(0, 'Jumlah fisik tidak boleh negatif'),
    reason: z
      .string()
      .trim()
      .min(5, 'Alasan stock opname wajib diisi minimal 5 karakter'),
  })
  .strict();

export type StockAdjustInput = z.infer<typeof StockAdjustSchema>;
export type StockOpnameInput = z.infer<typeof StockOpnameSchema>;
