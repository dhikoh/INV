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
} from '@prisma/client';
import { logger } from '../src/lib/logger';

export interface SeedOptions {
  username?: string;
  password?: string;
}

export async function seedSuperAdmin(options?: SeedOptions) {
  const username = options?.username ?? process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin';
  const password = options?.password ?? process.env.SEED_SUPERADMIN_PASSWORD ?? 'Superadmin123!';

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPERADMIN, deletedAt: null },
  });

  if (existingSuperAdmin) {
    logger.info(
      { userId: existingSuperAdmin.id, username: existingSuperAdmin.username },
      'Super Admin sudah ada di database.'
    );
    return existingSuperAdmin;
  }

  const passwordHash = await hashPassword(password, username);

  const superAdmin = await prisma.user.create({
    data: {
      username: username.trim().toLowerCase(),
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
    'Super Admin berhasil dibuat.'
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
      stockQty: 500,
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
      stockQty: 800,
      categoryId: catBento.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(29000),
      oldBasePrice: BigInt(34000),
    },
    {
      sku: 'BC-5.5L',
      name: 'BentoCat Premium Cat Litter 5.5L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan praktis 5.5 Liter (bobot ±4.3 kg).',
      unit: 'karung',
      costPrice: BigInt(18500), // HPP dari user
      basePrice: BigInt(20750), // Harga Baru Blitar
      minPrice: BigInt(19750),
      stockQty: 1200,
      categoryId: catBento.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(16500),
      oldBasePrice: BigInt(19750),
    },
    {
      sku: 'ZEO-01',
      name: 'Pasir Zeolite No. 1',
      description: 'Pasir Zeolite No. 1 butiran halus kemasan sak 20 kg untuk sanitasi dan alas kandang.',
      unit: 'sak',
      costPrice: BigInt(9500), // Modal Zeolite dari user
      basePrice: BigInt(20500),
      minPrice: BigInt(18000),
      stockQty: 250,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(19000),
    },
    {
      sku: 'ZEO-02',
      name: 'Pasir Zeolite No. 2',
      description: 'Pasir Zeolite No. 2 butiran sedang kemasan sak 20 kg.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(11000),
      minPrice: BigInt(10000),
      stockQty: 400,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(10000),
    },
    {
      sku: 'ZEO-03',
      name: 'Pasir Zeolite No. 3',
      description: 'Pasir Zeolite No. 3 butiran kasar kemasan sak 20 kg.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(11000),
      minPrice: BigInt(10000),
      stockQty: 350,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(10000),
    },
    {
      sku: 'ZEO-GRANUL',
      name: 'Pasir Granul Zeolite',
      description: 'Pasir Granul Zeolite kemasan sak 20 kg kualitas filtrasi tinggi.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(21500),
      minPrice: BigInt(19500),
      stockQty: 200,
      categoryId: catZeo.id,
      defaultVendorId: vendorMojo.id,
      oldCostPrice: BigInt(8500),
      oldBasePrice: BigInt(20000),
    },
  ];

  const seededProducts: Record<string, { id: string; sku: string; name: string }> = {};

  for (const p of productsData) {
    const prod = await prisma.product.upsert({
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
        costPrice: p.costPrice,
        basePrice: p.basePrice,
        minPrice: p.minPrice,
        stockQty: p.stockQty,
        name: p.name,
      },
    });

    seededProducts[p.sku] = { id: prod.id, sku: prod.sku, name: prod.name };

    // PriceHistory: Catat Jejak Riwayat Perubahan HPP & Harga Jual
    const existingHist = await prisma.priceHistory.findFirst({
      where: { businessId: business.id, productId: prod.id },
    });

    if (!existingHist) {
      // 1. Histori HPP Modal
      await prisma.priceHistory.create({
        data: {
          businessId: business.id,
          productId: prod.id,
          field: PriceField.COST,
          oldValue: p.oldCostPrice,
          newValue: p.costPrice,
          reason: 'Penyesuaian HPP pasokan bahan baku dari Vendor Mojoagung',
          changedById: superAdmin.id,
          createdAt: new Date('2026-01-15T08:00:00Z'),
        },
      });

      // 2. Histori Harga Jual Dasar (Base Price)
      await prisma.priceHistory.create({
        data: {
          businessId: business.id,
          productId: prod.id,
          field: PriceField.BASE,
          oldValue: p.oldBasePrice,
          newValue: p.basePrice,
          reason: 'Pembaruan Daftar Harga Resmi BentoCat 2026',
          changedById: superAdmin.id,
          createdAt: new Date('2026-02-01T09:00:00Z'),
        },
      });
    }
  }

  logger.info('Master Produk dan Riwayat Harga awal berhasil di-seed.');

  // 7. Pelanggan Riil & Alamat Lengkap
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
      address: 'Jl. Raya Bojonegoro - Tuban, Jawa Timur',
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
      name: 'Timika Petshop',
      contactName: 'Owner Timika Petshop',
      address: 'Jl. Cenderawasih, Timika, Papua',
      phone: '081234567806',
      specialPrices: {
        'BC-25L': BigInt(75500),
        'BC-10L': BigInt(39000),
        'BC-5.5L': BigInt(22750),
      },
      promoHistories: {
        'BC-25L': BigInt(74500),
        'BC-10L': BigInt(38000),
        'BC-5.5L': BigInt(22500),
      },
    },
  ];

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

    // Masukkan Harga Minimal Khusus Pelanggan (CustomerMinPrice)
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
      { productId: seededProducts['BC-25L'].id, qty: 300, unitCost: BigInt(63250), lineTotal: BigInt(63250 * 300) },
      { productId: seededProducts['BC-10L'].id, qty: 500, unitCost: BigInt(32000), lineTotal: BigInt(32000 * 500) },
      { productId: seededProducts['BC-5.5L'].id, qty: 600, unitCost: BigInt(18500), lineTotal: BigInt(18500 * 600) },
      { productId: seededProducts['ZEO-02'].id, qty: 200, unitCost: BigInt(9500), lineTotal: BigInt(9500 * 200) },
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
        shippingCost: BigInt(1500000), // Ongkir truk ekspedisi
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

  // 9. Sample Transaksi Riil (Vetma Petshop Blitar Dok 2)
  const vetmaCustomer = await prisma.customer.findFirst({
    where: { businessId: business.id, code: 'VETMA-BLT' },
  });

  const existingOrder = await prisma.order.findFirst({
    where: { businessId: business.id, orderNo: 'VETMA/INV/02/05/2026/0002' },
  });

  if (!existingOrder && vetmaCustomer && seededProducts['BC-10L'] && seededProducts['BC-5.5L']) {
    const item1Qty = 250;
    const item1Price = BigInt(36000);
    const item1Cost = BigInt(32000);
    const item1Subtotal = item1Price * BigInt(item1Qty);

    const item2Qty = 250;
    const item2Price = BigInt(20750);
    const item2Cost = BigInt(18500);
    const item2Subtotal = item2Price * BigInt(item2Qty);

    const grandTotal = item1Subtotal + item2Subtotal;
    const dpAmount = BigInt(4000000);

    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: vetmaCustomer.id,
        salesId: dinia.id,
        status: OrderStatus.COMPLETED,
        version: 1,
        customerSeq: 2,
        orderNo: 'VETMA/INV/02/05/2026/0002',
        orderDate: new Date('2026-05-02T10:00:00Z'),
        deliveryAddress: vetmaCustomer.address,
        notes: 'Transaksi Repeat Order Dok No 2 Vetma Petshop Blitar',
        subtotal: grandTotal,
        grandTotal,
        dpBps: 3000,
        dpAmount,
        paidTotal: grandTotal,
        items: {
          create: [
            {
              businessId: business.id,
              productId: seededProducts['BC-10L'].id,
              productName: seededProducts['BC-10L'].name,
              sku: seededProducts['BC-10L'].sku,
              unit: 'karung',
              qty: item1Qty,
              listPrice: item1Price,
              unitPrice: item1Price,
              lineSubtotal: item1Subtotal,
              lineDiscount: BigInt(0),
              lineNet: item1Subtotal,
              costPrice: item1Cost,
              floorPrice: item1Price,
            },
            {
              businessId: business.id,
              productId: seededProducts['BC-5.5L'].id,
              productName: seededProducts['BC-5.5L'].name,
              sku: seededProducts['BC-5.5L'].sku,
              unit: 'karung',
              qty: item2Qty,
              listPrice: item2Price,
              unitPrice: item2Price,
              lineSubtotal: item2Subtotal,
              lineDiscount: BigInt(0),
              lineNet: item2Subtotal,
              costPrice: item2Cost,
              floorPrice: item2Price,
            },
          ],
        },
      },
    });

    logger.info('Sample Order & Transaksi Vetma Petshop Dok 2 berhasil di-seed.');
  }

  logger.info('==> Seluruh data operasional BentoCat SUKSES di-seed!');
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
