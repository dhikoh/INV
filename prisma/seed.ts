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
} from '@prisma/client';
import { logger } from '../src/lib/logger';

export interface SeedOptions {
  username?: string;
  password?: string;
}

export async function seedSuperAdmin(options?: SeedOptions) {
  const username = options?.username ?? process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin';
  const password = options?.password ?? process.env.SEED_SUPERADMIN_PASSWORD ?? 'bismillahbento';

  const passwordHash = await hashPassword(password, username);

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPERADMIN, deletedAt: null },
  });

  if (existingSuperAdmin) {
    const updated = await prisma.user.update({
      where: { id: existingSuperAdmin.id },
      data: {
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      },
    });
    logger.info(
      { userId: updated.id, username: updated.username },
      'Super Admin diperbarui dengan password bismillahbento.'
    );
    return updated;
  }

  const superAdmin = await prisma.user.create({
    data: {
      username: username.trim().toLowerCase(),
      passwordHash,
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: false,
    },
  });

  logger.info(
    { userId: superAdmin.id, username: superAdmin.username },
    'Super Admin berhasil dibuat (password: bismillahbento).'
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
        address: 'Jl. Cemara No. 1, Kota Blitar, Jawa Timur',
        phone: '087777717300',
        email: 'admin@modula.click',
        invoiceTheme: InvoiceTheme.PROFESIONAL,
        allowNegativeStock: true,
        defaultDpBps: 3000,
        dueDays: 14,
        isActive: true,
      },
    });
    logger.info({ businessId: business.id }, 'Unit usaha BentoCat berhasil dibuat.');
  } else {
    logger.info({ businessId: business.id, code: business.code }, 'Menggunakan unit usaha yang sudah ada.');
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
      description: 'Pasir kucing zeolite butiran halus No. 1 kemasan 20 kg/sak.',
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
      description: 'Pasir kucing zeolite butiran sedang No. 2 kemasan 20 kg/sak.',
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
      description: 'Pasir kucing zeolite butiran kasar No. 3 kemasan 20 kg/sak.',
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
      description: 'Pasir kucing mineral zeolite granul bulat kemasan 20 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(21500),
      minPrice: BigInt(20000),
      stockQty: 500,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
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

  const seededCustomers: Record<string, { id: string; name: string; address: string }> = {};

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

    seededCustomers[c.code] = { id: customer.id, name: customer.name, address: customer.address ?? '' };

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
    customerSeq: number;
    orderDate: Date;
    notes: string;
    shippingCharge: bigint;
    discountTotal: bigint;
    dpAmount: bigint;
    items: SeedOrderItem[];
  }

  const transactionsToSeed: SeedTransaction[] = [
    // 1. Blitar (Vetma Petshop) - Dok 2
    {
      customerCode: 'VETMA-BLT',
      orderNo: 'VETMA/INV/02/05/2026/0002',
      invoiceNo: 'INV/BLT/2026/05/0002',
      customerSeq: 2,
      orderDate: new Date('2026-05-02T10:00:00Z'),
      notes: 'Repeat Order Dok 2 Vetma Petshop Blitar',
      shippingCharge: BigInt(0),
      discountTotal: BigInt(0),
      dpAmount: BigInt(4000000),
      items: [
        { sku: 'BC-10L', qty: 250, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(20750), costPrice: BigInt(18500) },
      ],
    },
    // 2. Cilacap (Cherry Petshop) - Dok 13 BentoCat
    {
      customerCode: 'CHERRY-CLP',
      orderNo: 'CHERRY/INV/13/11/2023/0013',
      invoiceNo: 'INV/CLP/2023/11/0013',
      customerSeq: 13,
      orderDate: new Date('2023-11-09T10:00:00Z'),
      notes: 'Repeat Order Dok 13 Cherry Petshop Cilacap (Diskon 2% & Subsidi Ongkir)',
      shippingCharge: BigInt(1900000),
      discountTotal: BigInt(578100),
      dpAmount: BigInt(10000000),
      items: [
        {
          sku: 'BC-25L',
          qty: 410,
          unitPrice: BigInt(70500),
          costPrice: BigInt(63250),
          discountType: DiscountType.PERCENT,
          discountValue: BigInt(200), // 2%
          lineDiscount: BigInt(578100),
        },
      ],
    },
    // 3. Cilacap (Cherry Petshop) - Dok 4 Zeolite
    {
      customerCode: 'CHERRY-CLP',
      orderNo: 'CHERRY/ZEO/04/03/2025/0004',
      invoiceNo: 'INV/ZEO/2025/03/0004',
      customerSeq: 14,
      orderDate: new Date('2025-03-11T10:00:00Z'),
      notes: 'Repeat Order Dok 4 Pasir Zeolite Cherry Petshop Cilacap',
      shippingCharge: BigInt(0),
      discountTotal: BigInt(0),
      dpAmount: BigInt(1000000),
      items: [
        { sku: 'ZEO-02', qty: 150, unitPrice: BigInt(11000), costPrice: BigInt(9500) },
        { sku: 'ZEO-GRANUL', qty: 100, unitPrice: BigInt(21500), costPrice: BigInt(9500) },
      ],
    },
    // 4. Bojonegoro (Aulia Petshop) - Dok 11
    {
      customerCode: 'AULIA-BJN',
      orderNo: 'AULIA/INV/11/02/2024/0011',
      invoiceNo: 'INV/BJN/2024/02/0011',
      customerSeq: 11,
      orderDate: new Date('2024-02-05T10:00:00Z'),
      notes: 'Repeat Order Dok 11 Drh. Aulia (Aulia Petshop Bojonegoro)',
      shippingCharge: BigInt(850000),
      discountTotal: BigInt(0),
      dpAmount: BigInt(10000000),
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(72000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 150, unitPrice: BigInt(36000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500), costPrice: BigInt(18500) },
      ],
    },
    // 5. Semarang (Gukguk Meong) - Dok 35
    {
      customerCode: 'GUKGUK-SMG',
      orderNo: 'GUKGUK/INV/35/10/2026/0035',
      invoiceNo: 'INV/SMG/2026/10/0035',
      customerSeq: 35,
      orderDate: new Date('2026-10-05T10:00:00Z'),
      notes: 'Repeat Order Dok 35 Ny. Noni & Ny. Maria (Semarang)',
      shippingCharge: BigInt(1450000),
      discountTotal: BigInt(0),
      dpAmount: BigInt(10000000),
      items: [
        { sku: 'BC-25L', qty: 373, unitPrice: BigInt(76500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(38500), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(21750), costPrice: BigInt(18500) },
      ],
    },
    // 6. Lamongan (Aura Petshop) - Dok 11
    {
      customerCode: 'AURA-LMG',
      orderNo: 'AURA/INV/11/06/2026/0011',
      invoiceNo: 'INV/LMG/2026/06/0011',
      customerSeq: 11,
      orderDate: new Date('2026-06-17T10:00:00Z'),
      notes: 'Repeat Order Dok 11 Aura Petshop Lamongan',
      shippingCharge: BigInt(850000),
      discountTotal: BigInt(0),
      dpAmount: BigInt(10000000),
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(75000), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 135, unitPrice: BigInt(38000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 270, unitPrice: BigInt(21500), costPrice: BigInt(18500) },
      ],
    },
    // 7. Timika (Meka Petshop - Pak Anwar) - Dok 5
    {
      customerCode: 'TIMIKA-PAP',
      orderNo: 'MEKA/INV/05/08/2026/0005',
      invoiceNo: 'INV/TMK/2026/08/0005',
      customerSeq: 5,
      orderDate: new Date('2026-08-03T10:00:00Z'),
      notes: 'Repeat Order Dok 5 Pak Anwar (Meka Petshop Timika, Papua)',
      shippingCharge: BigInt(750000),
      discountTotal: BigInt(0),
      dpAmount: BigInt(3000000),
      items: [
        { sku: 'BC-25L', qty: 75, unitPrice: BigInt(72500), costPrice: BigInt(63250) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(37000), costPrice: BigInt(32000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(21750), costPrice: BigInt(18500) },
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
        discountTotal: t.discountTotal,
        shippingCharge: t.shippingCharge,
        grandTotal,
        dpBps: 3000,
        dpAmount: t.dpAmount,
        paidTotal: grandTotal,
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

    // 3. Catat Pembayaran Lunas (Payment VERIFIED via BCA)
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        invoiceId: invoice.id,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: grandTotal,
        paidAt: t.orderDate,
        reference: `TRF-BCA-${t.invoiceNo.replace(/\//g, '-')}`,
        notes: `Pelunasan via transfer BCA 0901422817 a.n. DHIKO HERLAMBANG untuk pesanan ${t.orderNo}`,
        createdById: dinia.id,
        verifiedById: superAdmin.id,
        verifiedAt: t.orderDate,
      },
    });

    logger.info({ orderNo: t.orderNo, invoiceNo: t.invoiceNo, grandTotal: grandTotal.toString() }, 'Pesanan, Faktur, dan Pembayaran berhasil di-seed.');
  }

  logger.info('==> Seluruh data operasional BentoCat & Faktur SUKSES di-seed!');
}

export async function runAllSeed() {
  const superAdmin = await seedSuperAdmin();
  await seedBentoCatData(superAdmin);
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
