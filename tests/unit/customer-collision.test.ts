import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeIndonesianPhone,
  cleanStoreName,
  extractCityFromRecord,
  areCitiesMatching,
} from '@/lib/domain/phone';
import {
  checkCustomerCollision,
  TAG_PENDING_VERIFIKASI_ADMIN,
} from '@/lib/services/customerCollision';

describe('1. Normalisasi Nomor Telepon Indonesia (normalizeIndonesianPhone)', () => {
  it('menormalisasi awalan +62 menjadi format baku 08', () => {
    expect(normalizeIndonesianPhone('+62 812-3456-7890')).toBe('081234567890');
    expect(normalizeIndonesianPhone('+6281234567890')).toBe('081234567890');
  });

  it('menormalisasi awalan 62 tanpa tanda tambah', () => {
    expect(normalizeIndonesianPhone('6281234567890')).toBe('081234567890');
    expect(normalizeIndonesianPhone('62812 3456 7890')).toBe('081234567890');
  });

  it('mempertahankan format 08 standar dan menghapus spasi atau tanda strip', () => {
    expect(normalizeIndonesianPhone('0812-3456-7890')).toBe('081234567890');
    expect(normalizeIndonesianPhone('0812 3456 7890')).toBe('081234567890');
    expect(normalizeIndonesianPhone('085244972449')).toBe('085244972449');
  });

  it('menolak nomor tidak valid atau terlalu pendek / null', () => {
    expect(normalizeIndonesianPhone(null)).toBeNull();
    expect(normalizeIndonesianPhone(undefined)).toBeNull();
    expect(normalizeIndonesianPhone('')).toBeNull();
    expect(normalizeIndonesianPhone('12345')).toBeNull(); // terlalu pendek
  });
});

describe('2. Pembersihan Nama Toko (cleanStoreName)', () => {
  it('menghilangkan stopwords umum seperti petshop, pet shop, toko, ps, drh', () => {
    expect(cleanStoreName('Cherry Petshop')).toBe('cherry');
    expect(cleanStoreName('Cherry Pet Shop')).toBe('cherry');
    expect(cleanStoreName('Toko Cherry')).toBe('cherry');
    expect(cleanStoreName('Cherry PS')).toBe('cherry');
    expect(cleanStoreName('UD. Cherry')).toBe('cherry');
    expect(cleanStoreName('Drh Nela Dwi (Vetma Petshop)')).toBe('nela dwi vetma');
  });

  it('mengabaikan huruf besar-kecil dan tanda baca', () => {
    expect(cleanStoreName('AURA PETSHOP !!!')).toBe('aura');
    expect(cleanStoreName('Meka Petshop - Timika')).toBe('meka timika');
  });
});

describe('3. Deteksi Wilayah Kota (extractCityFromRecord & areCitiesMatching)', () => {
  it('mengekstrak nama kota dari alamat atau nama toko', () => {
    expect(
      extractCityFromRecord({ address: 'Jl. Mangga No. 27, Adipala, Kab. Cilacap Jateng' })
    ).toBe('cilacap');
    expect(
      extractCityFromRecord({ address: 'Kampung baris 505, Karangturi, Kota Semarang' })
    ).toBe('semarang');
    expect(
      extractCityFromRecord({ name: 'Aura Petshop (Lamongan)', address: 'Jl. Raya' })
    ).toBe('lamongan');
  });

  it('mencocokkan kota yang sama sebagai true', () => {
    const tokoA = { address: 'Adipala, Cilacap' };
    const tokoB = { address: 'Kroya, Kab. Cilacap Jawa Tengah' };
    expect(areCitiesMatching(tokoA, tokoB)).toBe(true);
  });

  it('membedakan kota yang berbeda sebagai false', () => {
    const tokoA = { address: 'Semarang Timur, Kota Semarang' };
    const tokoB = { address: 'Sananwetan, Kota Blitar' };
    expect(areCitiesMatching(tokoA, tokoB)).toBe(false);
  });
});

describe('4. Deteksi Tabrakan Calon Pelanggan (checkCustomerCollision)', () => {
  const mockExistingCustomers = [
    {
      id: 'cust_01',
      code: 'CHERRY-CLP',
      name: 'Cherry Petshop',
      phone: '081234567803',
      address: 'Jl. Mangga No. 27, Adipala, Kab. Cilacap',
      shippingAddress: 'Adipala, Cilacap',
      billingAddress: null,
      assignedSalesId: 'sales_dinia',
      assignedSales: { id: 'sales_dinia', name: 'Dinia', username: 'dinia' },
    },
    {
      id: 'cust_02',
      code: 'SAHABAT-SMG',
      name: 'Sahabat Petshop',
      phone: '081122334455',
      address: 'Jl. Pandanaran, Kota Semarang',
      shippingAddress: 'Semarang',
      billingAddress: null,
      assignedSalesId: 'sales_budi',
      assignedSales: { id: 'sales_budi', name: 'Budi', username: 'budi' },
    },
  ];

  const fakePrisma = {
    customer: {
      findMany: vi.fn().mockResolvedValue(mockExistingCustomers),
    },
  };

  it('PINTU 1: Menandai tabrakan jika nomor telepon sama (setelah normalisasi +62)', async () => {
    const res = await checkCustomerCollision(fakePrisma as any, {
      businessId: 'biz_01',
      name: 'Toko Kucing Baru Berbeda',
      phone: '+62 812-3456-7803', // Sama dengan Cherry Petshop
      address: 'Jl. Lain, Surabaya',
    });

    expect(res.hasCollision).toBe(true);
    expect(res.reason).toBe('PHONE_MATCH');
    expect(res.matchedCustomer?.code).toBe('CHERRY-CLP');
    expect(res.reasonDescription).toContain('081234567803');
  });

  it('PINTU 2: Menandai tabrakan jika Nama Toko Sama DAN Wilayah Kota Sama (meskipun HP beda)', async () => {
    const res = await checkCustomerCollision(fakePrisma as any, {
      businessId: 'biz_01',
      name: 'Cherry Pet Shop', // Mirip dengan Cherry Petshop
      phone: '089988776655',    // Nomor HP berbeda (misal no kasir)
      address: 'Kecamatan Kroya, Cilacap', // Kota SAMA (Cilacap)
    });

    expect(res.hasCollision).toBe(true);
    expect(res.reason).toBe('NAME_AND_CITY_MATCH');
    expect(res.matchedCustomer?.code).toBe('CHERRY-CLP');
    expect(res.reasonDescription?.toUpperCase()).toContain('CILACAP');
  });

  it('SKENARIO LOLOS: Nama Toko Sama tapi Wilayah Kota Berbeda (dan No HP beda) LOLOS LANGSUNG', async () => {
    // Sahabat Petshop sudah ada di SEMARANG binaan Budi
    // Sales lain mendaftarkan Sahabat Petshop di BLITAR dengan nomor HP berbeda
    const res = await checkCustomerCollision(fakePrisma as any, {
      businessId: 'biz_01',
      name: 'Sahabat Petshop', // Nama sama persis
      phone: '087788990011',   // HP berbeda
      address: 'Jl. Merdeka, Kota Blitar', // Kota BERBEDA (Blitar vs Semarang)
    });

    // HARUS LOLOS (hasCollision = false) karena kebetulan nama sama beda owner
    expect(res.hasCollision).toBe(false);
  });

  it('SKENARIO LOLOS: Toko baru dengan Nama & Nomor HP yang benar-benar unik', async () => {
    const res = await checkCustomerCollision(fakePrisma as any, {
      businessId: 'biz_01',
      name: 'Kucing Ceria Petshop',
      phone: '085566778899',
      address: 'Bojonegoro',
    });

    expect(res.hasCollision).toBe(false);
  });
});

describe('5. Penjagaan Pembuatan Order untuk Toko Berstatus PENDING_VERIFIKASI_ADMIN', () => {
  it('menolak sales yang mencoba membuat order untuk toko yang berstatus PENDING_VERIFIKASI_ADMIN', async () => {
    const { buildOrderSnapshot } = await import('@/lib/services/order');

    const fakeTx = {
      customer: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cust_pending',
          code: 'TOKO-PENDING',
          name: 'Toko Sedang Diverifikasi',
          assignedSalesId: 'sales_dinia',
          tags: [TAG_PENDING_VERIFIKASI_ADMIN],
        }),
      },
    };

    const salesCtx = {
      businessId: 'biz_01',
      user: {
        id: 'sales_dinia',
        role: 'SALES' as any,
        businessId: 'biz_01',
      },
    };

    await expect(
      buildOrderSnapshot(fakeTx as any, salesCtx as any, {
        customerId: 'cust_pending',
        items: [{ productId: 'prd_01', qty: 10, unitPrice: 50000 }],
      })
    ).rejects.toThrowError(/verifikasi Admin/i);
  });

  it('mengizinkan pembuatan order jika toko tidak memiliki tag PENDING_VERIFIKASI_ADMIN', async () => {
    const { buildOrderSnapshot } = await import('@/lib/services/order');

    const fakeTx = {
      customer: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cust_active',
          code: 'TOKO-AKTIF',
          name: 'Toko Resmi Aktif',
          assignedSalesId: 'sales_dinia',
          tags: ['REPEAT_ORDER'],
        }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prd_01',
            sku: 'BC-25L',
            name: 'BentoCat 25L',
            basePrice: BigInt(72000),
            minPrice: BigInt(68500),
            costPrice: BigInt(63250),
            unit: 'karung',
            isActive: true,
          },
        ]),
      },
      customerMinPrice: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      customerPromo: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      business: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'biz_01',
          code: 'BENTOCAT',
          name: 'BentoCat Premium Cat Litter',
          ppnEnabled: false,
          ppnRateBps: 0,
          defaultDpBps: 5000,
        }),
      },
    };

    const salesCtx = {
      businessId: 'biz_01',
      user: {
        id: 'sales_dinia',
        role: 'SALES' as any,
        businessId: 'biz_01',
      },
    };

    const snapshot = await buildOrderSnapshot(fakeTx as any, salesCtx as any, {
      customerId: 'cust_active',
      items: [{ productId: 'prd_01', qty: 10, unitPrice: 72000 }],
    });

    expect(snapshot.customer.code).toBe('TOKO-AKTIF');
    expect(snapshot.lines.length).toBe(1);
  });
});
