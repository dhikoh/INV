import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';
import {
  Role,
  VendorKind,
  InvoiceTheme,
  PriceField,
  PipelineStage,
  PoStatus,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
  PaymentType,
  PaymentMethod,
  PaymentStatus,
  DiscountType,
  DiscountSource,
  ShipMethod,
  ShipStatus,
} from '@prisma/client';
import { logger } from '../src/lib/logger';

export interface SeedOptions {
  username?: string;
  password?: string;
}

export async function seedSuperAdmin(options?: SeedOptions) {
  const username = (options?.username ?? process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin').trim().toLowerCase();
  const password = options?.password ?? process.env.SEED_SUPERADMIN_PASSWORD;

  if (!password) {
    throw new Error('SEED_SUPERADMIN_PASSWORD wajib disetel di env atau options tanpa fallback di kode');
  }

  if (password.length < 12) {
    throw new Error('Password Super Admin minimal 12 karakter untuk keamanan produksi');
  }

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPERADMIN, deletedAt: null },
  });

  if (existingSuperAdmin) {
    throw new Error('Seed ditolak: Akun Super Admin sudah terdaftar di database.');
  }

  const passwordHash = await hashPassword(password, username);

  const superAdmin = await prisma.user.create({
    data: {
      username,
      passwordHash,
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: true,
    },
  });

  logger.info(
    { userId: superAdmin.id, username: superAdmin.username },
    'Super Admin berhasil dibuat dengan aman.'
  );

  return superAdmin;
}

export async function seedBentoCatData(superAdmin: { id: string }) {
  logger.info('==> Memulai seeding data operasional BentoCat...');

  // 1. Unit Usaha BentoCat
  let business = await prisma.business.findFirst({
    where: { deletedAt: null },
  });

  if (!business) {
    business = await prisma.business.create({
      data: {
        code: 'BENTOCAT',
        name: 'BentoCat Premium Cat Litter',
        legalName: 'CV BentoCat Mandiri',
        address: 'Jl. Dr. Soekandar Gg. 1 No. 5 Sananwetan, Blitar, Jawa Timur',
        phone: '087777717300',
        email: 'admin@modula.click',
        invoiceTheme: InvoiceTheme.PROFESIONAL,
        allowNegativeStock: true,
        defaultDpBps: 5000,
        dueDays: 14,
        isActive: true,
      },
    });
    logger.info({ businessId: business.id }, 'Unit usaha BentoCat berhasil dibuat.');
  } else {
    business = await prisma.business.update({
      where: { id: business.id },
      data: {
        name: 'BentoCat Premium Cat Litter',
        legalName: 'CV BentoCat Mandiri',
        address: 'Jl. Dr. Soekandar Gg. 1 No. 5 Sananwetan, Blitar, Jawa Timur',
        defaultDpBps: 5000,
        dueDays: 14,
      },
    });
    logger.info({ businessId: business.id, code: business.code }, 'Menggunakan dan memperbarui unit usaha BentoCat.');
  }

  // 2. Rekening Bank BCA Resmi
  const existingBank = await prisma.bankAccount.findFirst({
    where: {
      businessId: business.id,
      accountNumber: '0901422817',
      deletedAt: null,
    },
  });

  if (!existingBank) {
    await prisma.bankAccount.create({
      data: {
        businessId: business.id,
        bankName: 'BCA',
        accountNumber: '0901422817',
        accountHolder: 'DHIKO HERLAMBANG',
        isDefault: true,
      },
    });
    logger.info('Rekening BCA 0901422817 a.n. DHIKO HERLAMBANG berhasil ditambahkan.');
  }

  // 3. Akun Sales Dinia
  const diniaUsername = 'dinia';
  const diniaPassword = 'bismillahbento';
  const diniaHash = await hashPassword(diniaPassword, diniaUsername);

  let dinia = await prisma.user.findFirst({
    where: { username: diniaUsername, deletedAt: null },
  });

  if (!dinia) {
    dinia = await prisma.user.create({
      data: {
        username: diniaUsername,
        name: 'Dinia',
        passwordHash: diniaHash,
        role: Role.SALES,
        businessId: business.id,
        isActive: true,
        mustChangePassword: false,
      },
    });
    logger.info('Akun sales Dinia berhasil dibuat (password: bismillahbento).');
  } else {
    dinia = await prisma.user.update({
      where: { id: dinia.id },
      data: {
        passwordHash: diniaHash,
        businessId: business.id,
        isActive: true,
        mustChangePassword: false,
      },
    });
    logger.info('Akun sales Dinia diperbarui.');
  }

  // 4. Kategori Produk
  const catBento = await prisma.category.upsert({
    where: {
      businessId_name: {
        businessId: business.id,
        name: 'Pasir BentoCat',
      },
    },
    create: {
      businessId: business.id,
      name: 'Pasir BentoCat',
      sortOrder: 1,
    },
    update: {},
  });

  const catZeo = await prisma.category.upsert({
    where: {
      businessId_name: {
        businessId: business.id,
        name: 'Pasir Zeolite',
      },
    },
    create: {
      businessId: business.id,
      name: 'Pasir Zeolite',
      sortOrder: 2,
    },
    update: {},
  });

  // 5. Vendor
  const vendorMojo = await prisma.vendor.upsert({
    where: {
      businessId_code: {
        businessId: business.id,
        code: 'MOJO',
      },
    },
    create: {
      businessId: business.id,
      code: 'MOJO',
      name: 'Mojoagung',
      kind: VendorKind.SUPPLIER,
      picName: 'Pak Mojo',
      phone: '081234567890',
      address: 'Mojoagung, Jombang, Jawa Timur',
      paymentTermDays: 14,
      notes: 'Vendor supplier utama pasir bentonite dan pasir zeolite',
    },
    update: {
      name: 'Mojoagung',
    },
  });

  const vendorTransport = await prisma.vendor.upsert({
    where: {
      businessId_code: {
        businessId: business.id,
        code: 'TRANS',
      },
    },
    create: {
      businessId: business.id,
      code: 'TRANS',
      name: 'Ekspedisi Angkutan Logistik Truk',
      kind: VendorKind.TRANSPORT,
      picName: 'Koordinator Armada Logistik',
      phone: '081298765432',
      address: 'Rute Jawa Timur, Jawa Tengah, Bali, dan Papua',
      paymentTermDays: 7,
      notes: 'Armada pengiriman truk Fuso / Colt Diesel antar kota',
    },
    update: {},
  });

  logger.info({ mojoId: vendorMojo.id, transId: vendorTransport.id }, 'Vendor berhasil di-seed.');

  // 6. Master Produk BentoCat & Zeolite (Cappucino ditiadakan)
  const productsData = [
    {
      sku: 'BC-25L',
      name: 'BentoCat Premium Cat Litter 25L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan 25 Liter (bobot ±19.7 kg). Daya gumpal kuat dan wangi alami.',
      unit: 'karung',
      costPrice: BigInt(63250), // HPP dari user
      basePrice: BigInt(72000), // Harga Baru Blitar (Acuan)
      minPrice: BigInt(68500),  // Floor price
      stockQty: 1000,
      categoryId: catBento.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(58000),
      oldBasePrice: BigInt(68500),
    },
    {
      sku: 'BC-10L',
      name: 'BentoCat Premium Cat Litter 10L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan 10 Liter (bobot ±7.8 kg).',
      unit: 'karung',
      costPrice: BigInt(32000), // HPP dari user
      basePrice: BigInt(36000), // Harga Baru Blitar
      minPrice: BigInt(34000),
      stockQty: 1200,
      categoryId: catBento.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(29000),
      oldBasePrice: BigInt(34000),
    },
    {
      sku: 'BC-5.5L',
      name: 'BentoCat Premium Cat Litter 5.5L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan 5.5 Liter (bobot ±4.3 kg). Ringan & praktis.',
      unit: 'karung',
      costPrice: BigInt(18500), // HPP dari user
      basePrice: BigInt(20750), // Harga Baru Blitar
      minPrice: BigInt(20000),
      stockQty: 1500,
      categoryId: catBento.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(17000),
      oldBasePrice: BigInt(19500),
    },
    {
      sku: 'ZEO-01',
      name: 'Pasir Zeolite No 1 (Halus)',
      description: 'Pasir kucing zeolite butiran halus No. 1 kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500), // Modal dari user
      basePrice: BigInt(20500),
      minPrice: BigInt(18000),
      stockQty: 500,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(18500),
    },
    {
      sku: 'ZEO-02',
      name: 'Pasir Zeolite No 2 (Sedang)',
      description: 'Pasir kucing zeolite butiran sedang No. 2 kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(11000),
      minPrice: BigInt(10000),
      stockQty: 600,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(10000),
    },
    {
      sku: 'ZEO-03',
      name: 'Pasir Zeolite No 3 (Kasar)',
      description: 'Pasir kucing zeolite butiran kasar No. 3 kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(11000),
      minPrice: BigInt(10000),
      stockQty: 600,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(10000),
    },
    {
      sku: 'ZEO-GRANUL',
      name: 'Granul Zeolite (Butiran Bundar)',
      description: 'Pasir kucing mineral zeolite granul bulat kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(15000), // Sesuai koreksi user: HPP Rp 15.000
      basePrice: BigInt(21500),
      minPrice: BigInt(20000),
      stockQty: 500,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(13500),
      oldBasePrice: BigInt(19000),
    },
  ];

  const seededProducts: Record<string, { id: string; name: string; sku: string }> = {};

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: {
        businessId_sku: {
          businessId: business.id,
          sku: p.sku,
        },
      },
      create: {
        businessId: business.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        unit: p.unit,
        costPrice: p.costPrice,
        basePrice: p.basePrice,
        minPrice: p.minPrice,
        stockQty: p.stockQty,
        categoryId: p.categoryId,
        defaultVendorId: p.defaultVendorId,
        isActive: true,
      },
      update: {
        name: p.name,
        costPrice: p.costPrice,
        basePrice: p.basePrice,
        minPrice: p.minPrice,
        stockQty: p.stockQty,
      },
    });

    seededProducts[p.sku] = { id: product.id, name: product.name, sku: product.sku };

    // Simpan Jejak Sejarah Perubahan Harga Produk (PriceHistory)
    const existingHist = await prisma.priceHistory.findFirst({
      where: {
        businessId: business.id,
        productId: product.id,
        field: PriceField.BASE,
      },
    });

    if (!existingHist) {
      await prisma.priceHistory.create({
        data: {
          businessId: business.id,
          productId: product.id,
          field: PriceField.BASE,
          oldValue: p.oldBasePrice,
          newValue: p.basePrice,
          reason: 'Penyesuaian kenaikan harga baku & operasional per arsip invoice resmi BentoCat',
          changedById: superAdmin.id,
          createdAt: new Date('2026-01-01T08:00:00Z'),
        },
      });

      await prisma.priceHistory.create({
        data: {
          businessId: business.id,
          productId: product.id,
          field: PriceField.COST,
          oldValue: p.oldCostPrice,
          newValue: p.costPrice,
          reason: 'Penyesuaian HPP modal pabrik vendor Mojoagung',
          changedById: superAdmin.id,
          createdAt: new Date('2026-01-01T08:00:00Z'),
        },
      });
    }
  }

  logger.info('Master Produk BentoCat & Zeolite beserta PriceHistory berhasil di-seed.');

  // 7. Master Pelanggan (Petshop) Lintas Wilayah
  const customersData = [
    {
      code: 'VETMA-BLT',
      name: 'Drh Nela Dwi (Vetma Petshop)',
      contactName: 'Drh. Nela Dwi',
      address: 'Jl. Cemara perum cemara No.ruko 1, Tlumpu, Kec. Sukorejo, Kota Blitar',
      phone: '081234567801',
      specialPrices: {
        'BC-25L': BigInt(72000),
        'BC-10L': BigInt(36000),
        'BC-5.5L': BigInt(20750),
      },
      promoHistories: {
        'BC-25L': BigInt(70500),
        'BC-10L': BigInt(35000),
        'BC-5.5L': BigInt(20500),
      },
    },
    {
      code: 'HOME-BLT',
      name: 'Home Petshop (Bpk Antony Tan)',
      contactName: 'Bpk. Antony Tan',
      address: 'Jl. Dr. Wahidin No. 50, Kota Blitar',
      phone: '081234567802',
      specialPrices: {
        'BC-25L': BigInt(72000),
        'BC-10L': BigInt(36000),
        'BC-5.5L': BigInt(20750),
      },
      promoHistories: {
        'BC-25L': BigInt(70500),
        'BC-10L': BigInt(35000),
        'BC-5.5L': BigInt(20500),
      },
    },
    {
      code: 'CHERRY-CLP',
      name: 'Cherry Petshop',
      contactName: 'Ibu Cherry',
      address: 'Jl. Mangga No. 27 RT 01 RW 07, Desa Adipala, Kec. Adipala, Kab. Cilacap Jateng',
      phone: '081234567803',
      specialPrices: {
        'BC-25L': BigInt(73500),
        'BC-10L': BigInt(37000),
        'BC-5.5L': BigInt(21000),
        'ZEO-02': BigInt(11000),
        'ZEO-GRANUL': BigInt(21500),
      },
      promoHistories: {
        'BC-25L': BigInt(72500),
        'BC-10L': BigInt(36000),
        'BC-5.5L': BigInt(20750),
      },
    },
    {
      code: 'AULIA-BJN',
      name: 'Aulia Petshop (Bp. Hamid / drh. Aulia Insani)',
      contactName: 'Bp. Hamid',
      address: 'Jl. Ahmad Yani No. 2 Jambean, Sukorejo, Kec. Bojonegoro, Jawa Timur',
      phone: '081234567804',
      specialPrices: {
        'BC-25L': BigInt(75500),
        'BC-10L': BigInt(38000),
        'BC-5.5L': BigInt(21500),
      },
      promoHistories: {
        'BC-25L': BigInt(74000),
        'BC-10L': BigInt(37000),
        'BC-5.5L': BigInt(21250),
      },
    },
    {
      code: 'AULIA-TBN',
      name: 'Aulia Petshop (Tuban)',
      contactName: 'drh. Aulia Insani',
      address: 'Jl. Raya Tuban, Kab. Tuban, Jawa Timur',
      phone: '081234567808',
      specialPrices: {
        'BC-25L': BigInt(75500),
        'BC-10L': BigInt(38000),
        'BC-5.5L': BigInt(21500),
      },
      promoHistories: {
        'BC-25L': BigInt(74000),
        'BC-10L': BigInt(37000),
        'BC-5.5L': BigInt(21250),
      },
    },
    {
      code: 'AURA-LMG',
      name: 'Aura Petshop (Lamongan)',
      contactName: 'Owner Aura Petshop',
      address: 'Jl. Lamongan Raya, Kab. Lamongan, Jawa Timur',
      phone: '081234567807',
      specialPrices: {
        'BC-25L': BigInt(75000),
        'BC-10L': BigInt(38000),
        'BC-5.5L': BigInt(21500),
      },
      promoHistories: {
        'BC-25L': BigInt(74000),
        'BC-10L': BigInt(37000),
        'BC-5.5L': BigInt(21000),
      },
    },
    {
      code: 'GUKGUK-SMG',
      name: 'Gukguk Meong (Ny. Noni & Ny. Maria)',
      contactName: 'Ny. Noni & Ny. Maria',
      address: 'Kampung baris 505, Karangturi, Semarang Timur, Kota Semarang',
      phone: '081234567805',
      specialPrices: {
        'BC-25L': BigInt(76500),
        'BC-10L': BigInt(38500),
        'BC-5.5L': BigInt(21750),
      },
      promoHistories: {
        'BC-25L': BigInt(75000),
        'BC-10L': BigInt(37500),
        'BC-5.5L': BigInt(21500),
      },
    },
    {
      code: 'TIMIKA-PAP',
      name: 'Pak Anwar (Meka Petshop Timika)',
      contactName: 'Pak Anwar',
      address: 'Jl. Cenderawasih, Timika, Papua',
      phone: '085244972449',
      specialPrices: {
        'BC-25L': BigInt(72500),
        'BC-10L': BigInt(37000),
        'BC-5.5L': BigInt(21750),
      },
      promoHistories: {
        'BC-25L': BigInt(71500),
        'BC-10L': BigInt(36500),
        'BC-5.5L': BigInt(21500),
      },
    },
  ];

  const seededCustomers: Record<string, { id: string; name: string; address: string; contactName: string }> = {};

  for (const c of customersData) {
    const customer = await prisma.customer.upsert({
      where: {
        businessId_code: {
          businessId: business.id,
          code: c.code,
        },
      },
      create: {
        businessId: business.id,
        code: c.code,
        name: c.name,
        contactName: c.contactName,
        address: c.address,
        shippingAddress: c.address,
        billingAddress: c.address,
        phone: c.phone,
        assignedSalesId: dinia.id,
        pipelineStage: PipelineStage.REPEAT,
        notes: `Pelanggan aktif repeat order wilayah ${c.name}`,
      },
      update: {
        name: c.name,
        contactName: c.contactName,
        address: c.address,
        phone: c.phone,
        assignedSalesId: dinia.id,
        pipelineStage: PipelineStage.REPEAT,
      },
    });

    seededCustomers[c.code] = {
      id: customer.id,
      name: customer.name,
      address: customer.address ?? '',
      contactName: customer.contactName ?? '',
    };

    // Masukkan Batas Harga Khusus Pelanggan (CustomerMinPrice)
    for (const [sku, specialMinPrice] of Object.entries(c.specialPrices)) {
      const prodMeta = seededProducts[sku];
      if (prodMeta) {
        await prisma.customerMinPrice.upsert({
          where: {
            customerId_productId: {
              customerId: customer.id,
              productId: prodMeta.id,
            },
          },
          create: {
            businessId: business.id,
            customerId: customer.id,
            productId: prodMeta.id,
            minPrice: specialMinPrice,
            note: `Harga kesepakatan aktif wilayah ${c.name}`,
          },
          update: {
            minPrice: specialMinPrice,
          },
        });

        // Masukkan Jejak Riwayat Harga Khusus Pelanggan (PriceHistory: CUSTOMER_MIN)
        const promoPrice = (c.promoHistories as Record<string, bigint>)[sku];
        if (promoPrice) {
          const existCustHist = await prisma.priceHistory.findFirst({
            where: {
              businessId: business.id,
              productId: prodMeta.id,
              customerId: customer.id,
              field: PriceField.CUSTOMER_MIN,
            },
          });

          if (!existCustHist) {
            await prisma.priceHistory.create({
              data: {
                businessId: business.id,
                productId: prodMeta.id,
                customerId: customer.id,
                field: PriceField.CUSTOMER_MIN,
                oldValue: promoPrice,
                newValue: specialMinPrice,
                reason: `Penyesuaian batas harga wilayah repeat order ${c.name} (pernah berlaku promo: Rp ${promoPrice.toLocaleString('id-ID')})`,
                changedById: superAdmin.id,
                createdAt: new Date('2026-03-01T10:00:00Z'),
              },
            });
          }
        }
      }
    }
  }

  logger.info('Daftar Pelanggan dan Harga Khusus Pelanggan berhasil di-seed.');

  // 8. Purchase Order Awal (PO ke Mojoagung)
  const existingPo = await prisma.purchaseOrder.findFirst({
    where: { businessId: business.id, poNo: 'MOJO/PO/01/11/2026/0001' },
  });

  if (!existingPo && seededProducts['BC-25L'] && seededProducts['BC-10L']) {
    const poItems = [
      { productId: seededProducts['BC-25L'].id, qty: 500, unitCost: BigInt(63250), lineTotal: BigInt(63250 * 500) },
      { productId: seededProducts['BC-10L'].id, qty: 800, unitCost: BigInt(32000), lineTotal: BigInt(32000 * 800) },
      { productId: seededProducts['BC-5.5L'].id, qty: 1000, unitCost: BigInt(18500), lineTotal: BigInt(18500 * 1000) },
      { productId: seededProducts['ZEO-02'].id, qty: 300, unitCost: BigInt(9500), lineTotal: BigInt(9500 * 300) },
      { productId: seededProducts['ZEO-GRANUL'].id, qty: 200, unitCost: BigInt(9500), lineTotal: BigInt(9500 * 200) },
    ];
    const poSubtotal = poItems.reduce((acc, it) => acc + it.lineTotal, BigInt(0));

    await prisma.purchaseOrder.create({
      data: {
        businessId: business.id,
        vendorId: vendorMojo.id,
        poNo: 'MOJO/PO/01/11/2026/0001',
        status: PoStatus.RECEIVED,
        orderDate: new Date('2026-11-01T09:00:00Z'),
        expectedDate: new Date('2026-11-04T15:00:00Z'),
        subtotal: poSubtotal,
        shippingCost: BigInt(1500000),
        total: poSubtotal + BigInt(1500000),
        paidTotal: poSubtotal + BigInt(1500000),
        notes: 'Pengadaan stok awal pasir BentoCat dan Zeolite dari Vendor Mojoagung',
        createdById: superAdmin.id,
        items: {
          create: poItems.map((it) => ({
            productId: it.productId,
            qty: it.qty,
            receivedQty: it.qty,
            unitCost: it.unitCost,
            lineTotal: it.lineTotal,
          })),
        },
      },
    });

    logger.info('Sample Purchase Order ke Mojoagung berhasil di-seed.');
  }

  // 9. Transaksi Operasional Riil Lintas Kota (Blitar, Cilacap, Bojonegoro, Semarang, Lamongan, Timika)
  interface SeedOrderItem {
    sku: string;
    qty: number;
    unitPrice: bigint;
    costPrice: bigint;
    discountType?: DiscountType;
    discountValue?: bigint;
    lineDiscount?: bigint;
  }

  interface SeedTransaction {
    customerCode: string;
    orderNo: string;
    invoiceNo: string;
    deliveryNo: string;
    customerSeq: number;
    orderDate: Date;
    notes: string;
    shippingCharge: bigint;
    shippingCost: bigint;
    items: SeedOrderItem[];
  }

  const transactionsToSeed: SeedTransaction[] = [
    // --- CILACAP (Cherry Petshop) ---
    {
      customerCode: 'CHERRY-CLP',
      customerSeq: 26,
      orderNo: 'CHERRY/INV/26/04/2026/0026',
      invoiceNo: 'INV/CLP/2026/04/0026',
      deliveryNo: 'SJ/CLP/2026/04/0026',
      orderDate: new Date('2026-04-14T08:00:00Z'),
      notes: 'Repeat Order Dok 26 Cherry Petshop Cilacap',
      shippingCharge: BigInt(1900000),
      shippingCost: BigInt(1900000),
      items: [
        { sku: 'BC-25L', qty: 320, unitPrice: BigInt(70500), costPrice: BigInt(63250) },
        { sku: 'BC-5.5L', qty: 500, unitPrice: BigInt(20000), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'CHERRY-CLP',
      customerSeq: 27,
      orderNo: 'CHERRY/INV/27/06/2026/0027',
      invoiceNo: 'INV/CLP/2026/06/0027',
      deliveryNo: 'SJ/CLP/2026/06/0027',
      orderDate: new Date('2026-06-24T08:00:00Z'),
      notes: 'Repeat Order Dok 27 Cherry Petshop Cilacap',
      shippingCharge: BigInt(1900000),
      shippingCost: BigInt(1900000),
      items: [
        { sku: 'BC-25L', qty: 320, unitPrice: BigInt(73500), costPrice: BigInt(63250) },
        { sku: 'BC-5.5L', qty: 500, unitPrice: BigInt(21000), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'CHERRY-CLP',
      customerSeq: 28,
      orderNo: 'CHERRY/INV/28/08/2026/0028',
      invoiceNo: 'INV/CLP/2026/08/0028',
      deliveryNo: 'SJ/CLP/2026/08/0028',
      orderDate: new Date('2026-08-26T08:00:00Z'),
      notes: 'Repeat Order Dok 28 REVISI Cherry Petshop Cilacap',
      shippingCharge: BigInt(1900000),
      shippingCost: BigInt(1900000),
      items: [
        { sku: 'BC-25L', qty: 300, unitPrice: BigInt(73500), costPrice: BigInt(63250) },
        { sku: 'BC-5.5L', qty: 500, unitPrice: BigInt(21000), costPrice: BigInt(18500) },
      ],
    },

    // --- SEMARANG (Ny. Noni & Ny. Maria) ---
    {
      customerCode: 'GUKGUK-SMG',
      customerSeq: 32,
      orderNo: 'GUKGUK/INV/32/02/2026/0032',
      invoiceNo: 'INV/SMG/2026/02/0032',
      deliveryNo: 'SJ/SMG/2026/02/0032',
      orderDate: new Date('2026-02-21T08:00:00Z'),
      notes: 'Repeat Order Dok 32 Semarang (Ny. Noni & Ny. Maria)',
      shippingCharge: BigInt(1450000),
      shippingCost: BigInt(1450000),
      items: [
        { sku: 'BC-25L', qty: 410, unitPrice: BigInt(73000), costPrice: BigInt(63250) },
      ],
    },
    {
      customerCode: 'GUKGUK-SMG',
      customerSeq: 33,
      orderNo: 'GUKGUK/INV/33/02/2026/0033',
      invoiceNo: 'INV/SMG/2026/02/0033',
      deliveryNo: 'SJ/SMG/2026/02/0033',
      orderDate: new Date('2026-02-21T10:00:00Z'),
      notes: 'Repeat Order Dok 33 Semarang (Ny. Noni & Ny. Maria)',
      shippingCharge: BigInt(1450000),
      shippingCost: BigInt(1450000),
      items: [
        { sku: 'BC-25L', qty: 340, unitPrice: BigInt(73000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 110, unitPrice: BigInt(36500), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 110, unitPrice: BigInt(20750), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'GUKGUK-SMG',
      customerSeq: 35,
      orderNo: 'GUKGUK/INV/35/10/2026/0035',
      invoiceNo: 'INV/SMG/2026/10/0035',
      deliveryNo: 'SJ/SMG/2026/10/0035',
      orderDate: new Date('2026-10-05T08:00:00Z'),
      notes: 'Repeat Order Dok 35 Semarang (Ny. Noni & Ny. Maria)',
      shippingCharge: BigInt(1450000),
      shippingCost: BigInt(1450000),
      items: [
        { sku: 'BC-25L', qty: 373, unitPrice: BigInt(76500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(38500), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(21750), costPrice: BigInt(18500) },
      ],
    },

    // --- BOJONEGORO (Aulia Petshop) ---
    {
      customerCode: 'AULIA-BJN',
      customerSeq: 17,
      orderNo: 'AULIA/INV/17/03/2026/0017',
      invoiceNo: 'INV/BJN/2026/03/0017',
      deliveryNo: 'SJ/BJN/2026/03/0017',
      orderDate: new Date('2026-03-03T08:00:00Z'),
      notes: 'Repeat Order Dok 17 Aulia Petshop Bojonegoro',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 325, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 170, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'AULIA-BJN',
      customerSeq: 18,
      orderNo: 'AULIA/INV/18/04/2026/0018',
      invoiceNo: 'INV/BJN/2026/04/0018',
      deliveryNo: 'SJ/BJN/2026/04/0018',
      orderDate: new Date('2026-04-21T08:00:00Z'),
      notes: 'Repeat Order Dok 18 Aulia Petshop Bojonegoro',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 335, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 130, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 150, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'AULIA-BJN',
      customerSeq: 19,
      orderNo: 'AULIA/INV/19/09/2026/0019',
      invoiceNo: 'INV/BJN/2026/09/0019',
      deliveryNo: 'SJ/BJN/2026/09/0019',
      orderDate: new Date('2026-09-26T08:00:00Z'),
      notes: 'Repeat Order Dok 19 REVISI Aulia Petshop Bojonegoro',
      shippingCharge: BigInt(800000),
      shippingCost: BigInt(800000),
      items: [
        { sku: 'BC-25L', qty: 360, unitPrice: BigInt(75500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 105, unitPrice: BigInt(38000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 105, unitPrice: BigInt(21500), costPrice: BigInt(18500) },
      ],
    },

    // --- LAMONGAN (Aura Petshop) ---
    {
      customerCode: 'AURA-LMG',
      customerSeq: 9,
      orderNo: 'AURA/INV/09/05/2025/0009',
      invoiceNo: 'INV/LMG/2025/05/0009',
      deliveryNo: 'SJ/LMG/2025/05/0009',
      orderDate: new Date('2025-05-30T08:00:00Z'),
      notes: 'Repeat Order Dok 9 Aura Petshop Lamongan',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 310, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 200, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'AURA-LMG',
      customerSeq: 10,
      orderNo: 'AURA/INV/10/11/2025/0010',
      invoiceNo: 'INV/LMG/2025/11/0010',
      deliveryNo: 'SJ/LMG/2025/11/0010',
      orderDate: new Date('2025-11-20T08:00:00Z'),
      notes: 'Repeat Order Dok 10 Aura Petshop Lamongan',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 320, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 200, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'AURA-LMG',
      customerSeq: 11,
      orderNo: 'AURA/INV/11/06/2026/0011',
      invoiceNo: 'INV/LMG/2026/06/0011',
      deliveryNo: 'SJ/LMG/2026/06/0011',
      orderDate: new Date('2026-06-17T08:00:00Z'),
      notes: 'Repeat Order Dok 11 Aura Petshop Lamongan',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(75000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 135, unitPrice: BigInt(38000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 270, unitPrice: BigInt(21500), costPrice: BigInt(18500) },
      ],
    },

    // --- TUBAN (Aulia Petshop Tuban) ---
    {
      customerCode: 'AULIA-TBN',
      customerSeq: 9,
      orderNo: 'TUBAN/INV/09/07/2025/0009',
      invoiceNo: 'INV/TBN/2025/07/0009',
      deliveryNo: 'SJ/TBN/2025/07/0009',
      orderDate: new Date('2025-07-12T08:00:00Z'),
      notes: 'Repeat Order Dok 9 Tuban (drh. Aulia Insani / Bp. Hamid)',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 340, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 120, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'AULIA-TBN',
      customerSeq: 10,
      orderNo: 'TUBAN/INV/10/01/2026/0010',
      invoiceNo: 'INV/TBN/2026/01/0010',
      deliveryNo: 'SJ/TBN/2026/01/0010',
      orderDate: new Date('2026-01-15T08:00:00Z'),
      notes: 'Repeat Order Dok 10 Tuban (drh. Aulia Insani / Bp. Hamid)',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 150, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'AULIA-TBN',
      customerSeq: 11,
      orderNo: 'TUBAN/INV/11/08/2026/0011',
      invoiceNo: 'INV/TBN/2026/08/0011',
      deliveryNo: 'SJ/TBN/2026/08/0011',
      orderDate: new Date('2026-08-03T08:00:00Z'),
      notes: 'Repeat Order Dok 11 Tuban (drh. Aulia Insani / Bp. Hamid)',
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(75500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 150, unitPrice: BigInt(38000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(21500), costPrice: BigInt(18500) },
      ],
    },

    // --- TIMIKA PAPUA (Meka Petshop) ---
    {
      customerCode: 'TIMIKA-PAP',
      customerSeq: 3,
      orderNo: 'MEKA/INV/03/02/2026/0003',
      invoiceNo: 'INV/TMK/2026/02/0003',
      deliveryNo: 'SJ/TMK/2026/02/0003',
      orderDate: new Date('2026-02-06T08:00:00Z'),
      notes: 'Repeat Order Dok 3 Pak Anwar (Meka Petshop Timika)',
      shippingCharge: BigInt(500000),
      shippingCost: BigInt(500000),
      items: [
        { sku: 'BC-25L', qty: 10, unitPrice: BigInt(69500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 45, unitPrice: BigInt(35000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(20750), costPrice: BigInt(18500) },
        { sku: 'ZEO-03', qty: 5, unitPrice: BigInt(11000), costPrice: BigInt(9500) },
      ],
    },
    {
      customerCode: 'TIMIKA-PAP',
      customerSeq: 4,
      orderNo: 'MEKA/INV/04/05/2026/0004',
      invoiceNo: 'INV/TMK/2026/05/0004',
      deliveryNo: 'SJ/TMK/2026/05/0004',
      orderDate: new Date('2026-05-08T08:00:00Z'),
      notes: 'Repeat Order Dok 4 Pak Anwar (Meka Petshop Timika)',
      shippingCharge: BigInt(750000),
      shippingCost: BigInt(750000),
      items: [
        { sku: 'BC-25L', qty: 30, unitPrice: BigInt(69500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 100, unitPrice: BigInt(35000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 100, unitPrice: BigInt(20750), costPrice: BigInt(18500) },
        { sku: 'ZEO-02', qty: 5, unitPrice: BigInt(11000), costPrice: BigInt(9500) },
        { sku: 'ZEO-03', qty: 5, unitPrice: BigInt(11000), costPrice: BigInt(9500) },
      ],
    },
    {
      customerCode: 'TIMIKA-PAP',
      customerSeq: 5,
      orderNo: 'MEKA/INV/05/08/2026/0005',
      invoiceNo: 'INV/TMK/2026/08/0005',
      deliveryNo: 'SJ/TMK/2026/08/0005',
      orderDate: new Date('2026-08-03T08:00:00Z'),
      notes: 'Repeat Order Dok 5 Pak Anwar (Meka Petshop Timika)',
      shippingCharge: BigInt(750000),
      shippingCost: BigInt(750000),
      items: [
        { sku: 'BC-25L', qty: 75, unitPrice: BigInt(72500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(37000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(21750), costPrice: BigInt(18500) },
      ],
    },

    // --- BLITAR (Vetma Petshop) ---
    {
      customerCode: 'VETMA-BLT',
      customerSeq: 1,
      orderNo: 'VETMA/INV/01/12/2025/0001',
      invoiceNo: 'INV/BLT/2025/12/0001',
      deliveryNo: 'SJ/BLT/2025/12/0001',
      orderDate: new Date('2025-12-31T08:00:00Z'),
      notes: 'Repeat Order Dok 1 Vetma Petshop Blitar (Termasuk biaya bongkar Rp 100.000)',
      shippingCharge: BigInt(100000),
      shippingCost: BigInt(100000),
      items: [
        { sku: 'BC-25L', qty: 80, unitPrice: BigInt(68500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(34000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(19750), costPrice: BigInt(18500) },
      ],
    },
    {
      customerCode: 'VETMA-BLT',
      customerSeq: 2,
      orderNo: 'VETMA/INV/02/05/2026/0002',
      invoiceNo: 'INV/BLT/2026/05/0002',
      deliveryNo: 'SJ/BLT/2026/05/0002',
      orderDate: new Date('2026-05-02T08:00:00Z'),
      notes: 'Repeat Order Dok 2 Vetma Petshop Blitar (Termasuk biaya bongkar Rp 100.000)',
      shippingCharge: BigInt(100000),
      shippingCost: BigInt(100000),
      items: [
        { sku: 'BC-10L', qty: 250, unitPrice: BigInt(34000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(19750), costPrice: BigInt(18500) },
      ],
    },
  ];

  for (const t of transactionsToSeed) {
    const customer = seededCustomers[t.customerCode];
    if (!customer) continue;

    const existingOrder = await prisma.order.findFirst({
      where: { businessId: business.id, orderNo: t.orderNo },
    });

    if (existingOrder) {
      logger.info({ orderNo: t.orderNo }, 'Pesanan sudah ada di database, lewati.');
      continue;
    }

    let subtotal = BigInt(0);
    const orderItemsToCreate = [];

    for (let idx = 0; idx < t.items.length; idx++) {
      const it = t.items[idx];
      const prodMeta = seededProducts[it.sku];
      if (!prodMeta) continue;

      const lineSubtotal = it.unitPrice * BigInt(it.qty);
      const lineDiscount = it.lineDiscount ?? BigInt(0);
      const lineNet = lineSubtotal - lineDiscount;
      subtotal += lineNet;

      orderItemsToCreate.push({
        businessId: business.id,
        productId: prodMeta.id,
        productName: prodMeta.name,
        sku: prodMeta.sku,
        unit: it.sku.startsWith('ZEO') ? 'sak' : 'karung',
        qty: it.qty,
        listPrice: it.unitPrice,
        unitPrice: it.unitPrice,
        discountType: it.discountType ?? DiscountType.NONE,
        discountValue: it.discountValue ?? BigInt(0),
        discountSource: it.discountType ? DiscountSource.PROMO : DiscountSource.MANUAL,
        lineSubtotal,
        lineDiscount,
        lineNet,
        costPrice: it.costPrice,
        floorPrice: it.unitPrice,
        belowMin: false,
        sortOrder: idx + 1,
      });
    }

    const grandTotal = subtotal + t.shippingCharge;
    const dpAmount = grandTotal / BigInt(2); // DP 50%
    const pelunasanAmount = grandTotal - dpAmount;
    const dueDate = new Date(t.orderDate.getTime() + 14 * 24 * 3600 * 1000);

    // 1. Buat Pesanan
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        salesId: dinia.id,
        status: OrderStatus.COMPLETED,
        version: 1,
        customerSeq: t.customerSeq,
        orderNo: t.orderNo,
        orderDate: t.orderDate,
        deliveryAddress: customer.address,
        notes: t.notes,
        subtotal,
        discountTotal: BigInt(0),
        shippingCharge: t.shippingCharge,
        grandTotal,
        dpBps: 5000,
        dpAmount,
        paidTotal: grandTotal,
        repeatIntervalDays: 45,
        items: {
          create: orderItemsToCreate,
        },
      },
    });

    // 2. Buat Faktur Penjualan (Invoice APPROVED)
    const invoice = await prisma.invoice.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        customerId: customer.id,
        type: InvoiceType.FINAL,
        status: InvoiceStatus.APPROVED,
        version: 1,
        number: t.invoiceNo,
        amount: grandTotal,
        paidAmount: grandTotal,
        issueDate: t.orderDate,
        dueDate,
        theme: InvoiceTheme.PROFESIONAL,
        requestedById: dinia.id,
        approvedById: superAdmin.id,
        approvedAt: t.orderDate,
      },
    });

    // 3. Catat Pembayaran DP 50%
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        invoiceId: invoice.id,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: dpAmount,
        paidAt: t.orderDate,
        reference: `TRF-BCA-DP-${t.customerSeq}`,
        notes: `Down Payment (DP 50%) via transfer BCA 0901422817 a.n. DHIKO HERLAMBANG untuk pesanan ${t.orderNo}`,
        createdById: dinia.id,
        verifiedById: superAdmin.id,
        verifiedAt: t.orderDate,
      },
    });

    // 4. Catat Pembayaran Pelunasan 50% (H+4)
    const pelunasanDate = new Date(t.orderDate.getTime() + 4 * 24 * 3600 * 1000);
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        invoiceId: invoice.id,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: pelunasanAmount,
        paidAt: pelunasanDate,
        reference: `TRF-BCA-LUNAS-${t.customerSeq}`,
        notes: `Pelunasan sisa 50% via transfer BCA 0901422817 a.n. DHIKO HERLAMBANG untuk pesanan ${t.orderNo}`,
        createdById: dinia.id,
        verifiedById: superAdmin.id,
        verifiedAt: pelunasanDate,
      },
    });

    // 5. Catat Pengiriman Barang (Shipment DELIVERED)
    const shippedDate = new Date(t.orderDate.getTime() + 2 * 24 * 3600 * 1000);
    const deliveredDate = new Date(t.orderDate.getTime() + 4 * 24 * 3600 * 1000);
    await prisma.shipment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        deliveryNo: t.deliveryNo,
        method: ShipMethod.TRANSPORT_VENDOR,
        transporterId: vendorTransport.id,
        trackingNo: `TRK-${t.customerSeq}`,
        driverName: 'Armada Truk Logistik BentoCat',
        vehiclePlate: 'AG 8899 BC',
        receiverName: customer.contactName,
        status: ShipStatus.DELIVERED,
        actualCost: t.shippingCost,
        shippedAt: shippedDate,
        deliveredAt: deliveredDate,
        notes: `Pengiriman pesanan ${t.orderNo} ke ${customer.address}`,
      },
    });

    logger.info({ orderNo: t.orderNo, invoiceNo: t.invoiceNo, grandTotal: grandTotal.toString() }, 'Pesanan, Faktur, Pembayaran, dan Pengiriman berhasil di-seed.');
  }

  // 10. Seeding Document Counter (ORDER_SEQ per Customer)
  const lastSeqs: Record<string, number> = {
    'GUKGUK-SMG': 35,
    'CHERRY-CLP': 28,
    'AULIA-BJN': 19,
    'AURA-LMG': 11,
    'AULIA-TBN': 11,
    'TIMIKA-PAP': 5,
    'VETMA-BLT': 2,
  };

  for (const [cCode, lSeq] of Object.entries(lastSeqs)) {
    const cust = seededCustomers[cCode];
    if (cust) {
      await prisma.documentCounter.upsert({
        where: {
          businessId_scope_scopeId: {
            businessId: business.id,
            scope: 'ORDER_SEQ',
            scopeId: cust.id,
          },
        },
        create: {
          businessId: business.id,
          scope: 'ORDER_SEQ',
          scopeId: cust.id,
          lastSeq: lSeq,
        },
        update: {
          lastSeq: lSeq,
        },
      });
    }
  }

  // 11. Seeding Pengingat Siklus Repeat Order (Reminder)
  const intervalMap: Record<string, number> = {
    'GUKGUK-SMG': 45,
    'CHERRY-CLP': 60,
    'AULIA-BJN': 45,
    'AURA-LMG': 60,
    'AULIA-TBN': 60,
    'TIMIKA-PAP': 90,
    'VETMA-BLT': 45,
  };

  for (const [cCode, intDays] of Object.entries(intervalMap)) {
    const cust = seededCustomers[cCode];
    if (cust) {
      const custTxs = transactionsToSeed.filter((t) => t.customerCode === cCode);
      const lastTx = custTxs[custTxs.length - 1];
      const lastDate = lastTx ? lastTx.orderDate : new Date('2026-01-01T08:00:00Z');
      const nextDue = new Date(lastDate.getTime() + intDays * 24 * 3600 * 1000);

      const existingReminder = await prisma.reminder.findFirst({
        where: {
          businessId: business.id,
          customerId: cust.id,
        },
      });

      if (!existingReminder) {
        await prisma.reminder.create({
          data: {
            businessId: business.id,
            customerId: cust.id,
            salesId: dinia.id,
            intervalDays: intDays,
            lastOrderDate: lastDate,
            nextDueDate: nextDue,
            status: 'ACTIVE',
            source: 'AUTO',
            note: `Pengingat siklus repeat order berkala (${intDays} hari) pelanggan ${cust.name}`,
          },
        });
      }
    }
  }

  logger.info('==> Seluruh data operasional BentoCat & Faktur SUKSES di-seed!');
}

export async function runAllSeed() {
  try {
    const superAdmin = await seedSuperAdmin();
    if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true') {
      await seedBentoCatData(superAdmin);
    } else {
      logger.info('Melewati seed data demo BentoCat (hanya dijalankan bila NODE_ENV !== production dan SEED_DEMO_DATA=true).');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Akun Super Admin sudah terdaftar')) {
      logger.info('Akun Super Admin sudah ada di database, proses seed dilewati dengan aman.');
      return;
    }
    throw err;
  }
}

if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))
) {
  runAllSeed()
    .then(() => {
      logger.info('Proses seed selesai 100%.');
      process.exit(0);
    })
    .catch((err: Error) => {
      logger.error({ err }, err.message);
      process.exit(1);
    });
}
