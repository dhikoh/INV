import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogDocument, CatalogPdfData } from '@/lib/pdf/CatalogDocument';
import { renderReactToHtml } from '@/lib/pdf/engine';
import { resolvePublicVerifyDocument } from '@/lib/services/verify';
import { prisma } from '@/lib/db';
import { InvoiceTheme } from '@prisma/client';

describe('Catalog PDF Rendering & Anti-Fraud Compliance', () => {
  const baseMockData: CatalogPdfData = {
    title: 'Katalog Promo Ramadhan Spesial',
    subtitle: 'Pilihan Terbaik untuk Anabul Kesayangan',
    promoHighlight: 'DISKON HINGGA 40%',
    layoutStyle: 'TABLE',
    isPromo: true,
    promoValidityType: 'PERIOD',
    promoStartAt: '2026-03-01T00:00:00.000Z',
    promoEndAt: '2026-03-31T23:59:59.000Z',
    validityText: 'Periode: 1–31 Maret 2026 / Selama Persediaan Ada',
    showSku: true,
    ctaText: 'Pesan Sekarang ke Sales Resmi BentoCat',
    termsNote: '*Syarat & ketentuan berlaku. Harga sudah termasuk PPN.',
    date: '2026-11-13T00:00:00.000Z',
    note: 'Pengiriman langsung dari gudang Blitar.',
    verifyToken: 'cat_test_token_123',
    verifyUrl: 'http://localhost:3000/verify/cat_test_token_123',
    qrDataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    sales: {
      name: 'BentoCat Sales Rep',
      phone: '087777717300',
    },
    business: {
      name: 'BentoCat Premium Cat Litter',
      legalName: 'CV BentoCat Mandiri',
      address: 'Jl. Dr. Soekandar Gg. 1 No. 5 Sananwetan, Blitar',
      phone: '087777717300',
      email: 'admin@modula.click',
      website: 'https://bentocat.id',
      tagline: 'Pasir Kucing Gumpal & Wangi Pilihan Terbaik',
      instagram: '@bentocat.official',
      ppnEnabled: false,
      invoiceTheme: InvoiceTheme.PROFESIONAL,
    },
    customer: null,
    items: [
      {
        no: 1,
        productId: 'prod_01',
        name: 'BentoCat Apel 5L',
        sku: 'BC-APL-5L',
        unit: 'Bag',
        price: 25000,
        strikePrice: 30000,
        badgeText: 'BEST SELLER',
        itemNote: 'Aroma Segar Tahan Lama',
        imageDataUri: null,
      },
      {
        no: 2,
        productId: 'prod_02',
        name: 'BentoCat Kopi 5L',
        sku: 'BC-KOP-5L',
        unit: 'Bag',
        price: 26000,
        strikePrice: null,
        badgeText: null,
        itemNote: 'Menyerap Bau Ekstra',
        imageDataUri: null,
      },
    ],
  };

  it('berhasil me-render layout TABLE dengan tabel formal, kontak sales, dan QR verifikasi', async () => {
    const html = await renderReactToHtml(
      CatalogDocument({ data: { ...baseMockData, layoutStyle: 'TABLE' } })
    );

    expect(html).toContain('Katalog Promo Ramadhan Spesial');
    expect(html).toContain('BentoCat Apel 5L');
    expect(html).toContain('BC-APL-5L');
    expect(html).toContain('BEST SELLER');
    expect(html).toContain('Aroma Segar Tahan Lama');
    expect(html).toContain('25.000');
    expect(html).toContain('30.000'); // Coretan harga asal
    expect(html).toContain('BentoCat Sales Rep');
    expect(html).toContain('087777717300');
    expect(html).toContain('https://bentocat.id');
    expect(html).toContain('@bentocat.official');
    expect(html).toContain('cat_test_token_123');
  });

  it('berhasil me-render layout PROMO_GRID dengan kartu promo ritel', async () => {
    const html = await renderReactToHtml(
      CatalogDocument({ data: { ...baseMockData, layoutStyle: 'PROMO_GRID' } })
    );

    expect(html).toContain('Katalog Promo Ramadhan Spesial');
    expect(html).toContain('BentoCat Apel 5L');
    expect(html).toContain('BEST SELLER');
    expect(html).toContain('BentoCat Sales Rep');
  });

  it('berhasil me-render layout HERO_SALE dengan banner hero mencolok', async () => {
    const html = await renderReactToHtml(
      CatalogDocument({ data: { ...baseMockData, layoutStyle: 'HERO_SALE' } })
    );

    expect(html).toContain('DISKON HINGGA 40%');
    expect(html).toContain('Pilihan Terbaik untuk Anabul Kesayangan');
    expect(html).toContain('BentoCat Apel 5L');
    expect(html).toContain('Pesan Sekarang ke Sales Resmi BentoCat');
  });

  it('berhasil me-render layout EDITORIAL dengan lookbook minimalis elegan', async () => {
    const html = await renderReactToHtml(
      CatalogDocument({ data: { ...baseMockData, layoutStyle: 'EDITORIAL' } })
    );

    expect(html).toContain('Katalog Promo Ramadhan Spesial');
    expect(html).toContain('BentoCat Apel 5L');
    expect(html).toContain('BentoCat Kopi 5L');
  });

  it('Kepatuhan Anti-Fraud Ketat: HTML Katalog TIDAK PERNAH menampilkan rekening bank transfer', async () => {
    const html = await renderReactToHtml(
      CatalogDocument({ data: baseMockData })
    );

    expect(html).not.toContain('Rekening Pembayaran');
    expect(html).not.toContain('Bank BCA');
    expect(html).not.toContain('Bank Mandiri');
    expect(html).not.toContain('No. Rekening');
    expect(html).toContain('Katalog ini diterbitkan resmi oleh unit usaha');
  });
});

describe('Public QR Verification Service for Catalogs', () => {
  const mockBiz = {
    id: 'biz_01',
    code: 'BENTOCAT',
    name: 'BentoCat Premium Cat Litter',
    legalName: 'CV BentoCat Mandiri',
    address: 'Blitar, Jawa Timur',
    phone: '087777717300',
    email: 'admin@modula.click',
    website: 'https://bentocat.id',
    tagline: 'Pasir Terbaik',
    instagram: '@bentocat.official',
    paymentLegalNotice: null,
    showBankOnProforma: true,
  };

  const mockBankAccounts = [
    {
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountHolder: 'CV BentoCat Mandiri',
      isDefault: true,
    },
  ];

  const mockProduct = {
    id: 'p1',
    name: 'BentoCat Apel 5L',
    sku: 'BC-01',
    unit: 'Bag',
    basePrice: BigInt(30000),
    minPrice: BigInt(20000),
    isActive: true,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock queryRaw: pertama cek order/payment kosong, lalu cek catalog cocok
    vi.spyOn(prisma, '$queryRaw').mockImplementation((async (query: any) => {
      const sql = String(query?.strings || query || '');
      if (sql.includes('"Catalog"')) {
        return [{ id: 'cat_01', businessId: 'biz_01' }] as never;
      }
      return [] as never;
    }) as any);

    vi.spyOn(prisma.business, 'findFirst').mockResolvedValue(mockBiz as never);
    vi.spyOn(prisma.bankAccount, 'findMany').mockResolvedValue(mockBankAccounts as never);
    vi.spyOn(prisma.product, 'findMany').mockResolvedValue([mockProduct] as never);
  });

  it('memverifikasi token katalog aktif dan menghasilkan status OFFICIAL_APPROVED', async () => {
    vi.spyOn(prisma.catalog, 'findFirst').mockResolvedValue({
      id: 'cat_01',
      businessId: 'biz_01',
      title: 'Katalog Promo Ramadhan',
      subtitle: 'Diskon Spesial',
      promoHighlight: 'HEMAT 20%',
      layoutStyle: 'PROMO_GRID',
      isPromo: true,
      promoValidityType: 'PERIOD',
      promoStartAt: new Date(Date.now() - 86400000),
      promoEndAt: new Date(Date.now() + 86400000),
      validityText: 'Berlaku sampai besok',
      showStrikethroughPrice: true,
      showSku: true,
      ctaText: 'Pesan Sekarang',
      termsNote: 'S&K Berlaku',
      note: 'Catatan umum',
      verifyToken: 'token_active',
      createdAt: new Date(),
      deletedAt: null,
      ownerId: 'u_sales',
      items: [
        {
          id: 'ci_01',
          productId: 'p1',
          price: BigInt(25000),
          badgeText: 'BEST SELLER',
          itemNote: 'Kemasan 5L',
        },
      ],
    } as never);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u_sales',
      name: 'BentoCat Sales',
      phone: '087777717300',
      isActive: true,
      deletedAt: null,
    } as never);

    const doc = await resolvePublicVerifyDocument('token_active');
    expect(doc).not.toBeNull();
    expect(doc?.documentType).toBe('KATALOG_PROMO');
    expect(doc?.authenticityStatus).toBe('OFFICIAL_APPROVED');
    expect(doc?.catalogDetail?.products[0].price).toBe(25000);
    expect(doc?.catalogDetail?.products[0].badgeText).toBe('BEST SELLER');
    expect(doc?.banks).toHaveLength(1);
    expect(doc?.banks[0].bankName).toBe('BCA');
  });

  it('mendeteksi SALES_INACTIVE bila sales PIC katalog telah dinonaktifkan', async () => {
    vi.spyOn(prisma.catalog, 'findFirst').mockResolvedValue({
      id: 'cat_01',
      businessId: 'biz_01',
      title: 'Katalog Promo',
      isPromo: false,
      verifyToken: 'token_sales_off',
      createdAt: new Date(),
      deletedAt: null,
      ownerId: 'u_sales_off',
      items: [
        {
          id: 'ci_01',
          productId: 'p1',
          price: BigInt(25000),
        },
      ],
    } as never);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u_sales_off',
      name: 'Sales Resigned',
      phone: '081111111',
      isActive: false, // Sales dinonaktifkan
      deletedAt: null,
    } as never);

    const doc = await resolvePublicVerifyDocument('token_sales_off');
    expect(doc).not.toBeNull();
    expect(doc?.authenticityStatus).toBe('SALES_INACTIVE');
  });

  it('mendeteksi PROMO_EXPIRED bila tanggal promo berakhir telah lewat', async () => {
    vi.spyOn(prisma.catalog, 'findFirst').mockResolvedValue({
      id: 'cat_01',
      businessId: 'biz_01',
      title: 'Katalog Promo Telah Usai',
      isPromo: true,
      promoValidityType: 'PERIOD',
      promoEndAt: new Date(Date.now() - 3600000), // Lewat 1 jam yang lalu
      verifyToken: 'token_expired_promo',
      createdAt: new Date(),
      deletedAt: null,
      ownerId: 'u_sales',
      items: [
        {
          id: 'ci_01',
          productId: 'p1',
          price: BigInt(25000),
        },
      ],
    } as never);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u_sales',
      name: 'Sales Aktif',
      phone: '087777717300',
      isActive: true,
      deletedAt: null,
    } as never);

    const doc = await resolvePublicVerifyDocument('token_expired_promo');
    expect(doc).not.toBeNull();
    expect(doc?.authenticityStatus).toBe('PROMO_EXPIRED');
  });

  it('mendeteksi STALE_PRICE bila ada harga produk katalog di bawah harga paten terkini', async () => {
    vi.spyOn(prisma.catalog, 'findFirst').mockResolvedValue({
      id: 'cat_01',
      businessId: 'biz_01',
      title: 'Katalog Harga Tertinggal',
      isPromo: false,
      verifyToken: 'token_stale',
      createdAt: new Date(),
      deletedAt: null,
      ownerId: 'u_sales',
      items: [
        {
          id: 'ci_01',
          productId: 'p1',
          price: BigInt(18000), // Di katalog 18.000, tapi minPrice paten 20.000
        },
      ],
    } as never);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u_sales',
      name: 'Sales Aktif',
      phone: '087777717300',
      isActive: true,
      deletedAt: null,
    } as never);

    const doc = await resolvePublicVerifyDocument('token_stale');
    expect(doc).not.toBeNull();
    expect(doc?.authenticityStatus).toBe('STALE_PRICE');
  });
});
