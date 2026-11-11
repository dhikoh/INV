import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { zipSync, strToU8, Zippable } from 'fflate';
import * as argon2 from 'argon2';
import { TABLES } from '../src/lib/transfer/registry';
import { toJsonLine } from '../src/lib/transfer/serialize';

export const OWASP_ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

async function main() {
  console.log('===> Memulai pembuatan berkas transfer data resmi BentoCat Premium Cat Litter...');

  const diniaHash = await argon2.hash('bismillahbento', OWASP_ARGON2_OPTIONS);
  const now = new Date();

  // 1. Business
  const businessId = 'biz_bentocat_blitar_01';
  const businessCode = 'BENTOCAT';

  const businesses = [
    {
      id: businessId,
      code: businessCode,
      name: 'BentoCat Premium Cat Litter',
      legalName: 'CV BentoCat Mandiri',
      address: 'Jl. Dr. Soekandar Gg. 1 No. 5 Sananwetan, Blitar, Jawa Timur',
      phone: '087777717300',
      email: 'admin@modula.click',
      invoiceTheme: 'PROFESIONAL',
      allowNegativeStock: true,
      defaultDpBps: 5000, // 50%
      dueDays: 14,
      isActive: true,
      logoPath: null,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  // 2. Bank Account
  const bankAccounts = [
    {
      id: 'bnk_bca_dhiko_01',
      businessId,
      bankName: 'BCA',
      accountNumber: '0901422817',
      accountHolder: 'DHIKO HERLAMBANG',
      isDefault: true,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  // 3. User (Dinia - Sales)
  const diniaId = 'usr_dinia_sales_01';
  const users = [
    {
      id: diniaId,
      businessId,
      username: 'dinia',
      name: 'Dinia',
      role: 'SALES',
      passwordHash: diniaHash,
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  // 4. Categories
  const catBentoId = 'cat_bentocat_01';
  const catZeoId = 'cat_zeolite_01';
  const categories = [
    {
      id: catBentoId,
      businessId,
      name: 'Pasir BentoCat',
      sortOrder: 1,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: catZeoId,
      businessId,
      name: 'Pasir Zeolite',
      sortOrder: 2,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  // 5. Vendors
  const vendorMojoId = 'vnd_mojoagung_01';
  const vendorTransId = 'vnd_transport_01';
  const vendors = [
    {
      id: vendorMojoId,
      businessId,
      code: 'MOJO',
      name: 'Mojoagung',
      kind: 'SUPPLIER',
      picName: 'Pak Mojo',
      phone: '081234567890',
      address: 'Mojoagung, Jombang, Jawa Timur',
      paymentTermDays: 14,
      notes: 'Vendor supplier utama pasir bentonite dan pasir zeolite',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: vendorTransId,
      businessId,
      code: 'TRANS',
      name: 'Ekspedisi Angkutan Logistik Truk',
      kind: 'TRANSPORT',
      picName: 'Koordinator Armada Logistik',
      phone: '081298765432',
      address: 'Rute Jawa Timur, Jawa Tengah, Bali, dan Papua',
      paymentTermDays: 7,
      notes: 'Armada pengiriman truk Fuso / Colt Diesel antar kota',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  // 6. Products (7 SKU Resmi)
  const products = [
    {
      id: 'prd_bc_25l',
      businessId,
      sku: 'BC-25L',
      name: 'BentoCat Premium Cat Litter 25L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan 25 Liter (bobot ±19.7 kg). Daya gumpal kuat dan wangi alami.',
      unit: 'karung',
      costPrice: BigInt(63250), // HPP
      basePrice: BigInt(72000), // Dasar jual
      minPrice: BigInt(68500),  // Batas minimum
      stockQty: 1000,
      reservedQty: 0,
      minStockAlert: 50,
      categoryId: catBentoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: 'prd_bc_10l',
      businessId,
      sku: 'BC-10L',
      name: 'BentoCat Premium Cat Litter 10L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan 10 Liter (bobot ±7.8 kg).',
      unit: 'karung',
      costPrice: BigInt(32000),
      basePrice: BigInt(36000),
      minPrice: BigInt(34000),
      stockQty: 1200,
      reservedQty: 0,
      minStockAlert: 100,
      categoryId: catBentoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: 'prd_bc_55l',
      businessId,
      sku: 'BC-5.5L',
      name: 'BentoCat Premium Cat Litter 5.5L',
      description: 'Pasir gumpal wangi premium BentoCat kemasan 5.5 Liter (bobot ±4.3 kg). Ringan & praktis.',
      unit: 'karung',
      costPrice: BigInt(18500),
      basePrice: BigInt(20750),
      minPrice: BigInt(20000),
      stockQty: 1500,
      reservedQty: 0,
      minStockAlert: 100,
      categoryId: catBentoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: 'prd_zeo_01',
      businessId,
      sku: 'ZEO-01',
      name: 'Pasir Zeolite No 1 (Halus)',
      description: 'Pasir kucing zeolite butiran halus No. 1 kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(20500),
      minPrice: BigInt(18000),
      stockQty: 500,
      reservedQty: 0,
      minStockAlert: 30,
      categoryId: catZeoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: 'prd_zeo_02',
      businessId,
      sku: 'ZEO-02',
      name: 'Pasir Zeolite No 2 (Sedang)',
      description: 'Pasir kucing zeolite butiran sedang No. 2 kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(11000),
      minPrice: BigInt(10000),
      stockQty: 600,
      reservedQty: 0,
      minStockAlert: 30,
      categoryId: catZeoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: 'prd_zeo_03',
      businessId,
      sku: 'ZEO-03',
      name: 'Pasir Zeolite No 3 (Kasar)',
      description: 'Pasir kucing zeolite butiran kasar No. 3 kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(9500),
      basePrice: BigInt(11000),
      minPrice: BigInt(10000),
      stockQty: 600,
      reservedQty: 0,
      minStockAlert: 30,
      categoryId: catZeoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: 'prd_zeo_granul',
      businessId,
      sku: 'ZEO-GRANUL',
      name: 'Granul Zeolite (Butiran Bundar)',
      description: 'Pasir kucing mineral zeolite granul bulat kemasan 18 kg/sak.',
      unit: 'sak',
      costPrice: BigInt(15000), // Sesuai koreksi user: HPP 15.000
      basePrice: BigInt(21500),
      minPrice: BigInt(20000),
      stockQty: 500,
      reservedQty: 0,
      minStockAlert: 30,
      categoryId: catZeoId,
      defaultVendorId: vendorMojoId,
      isActive: true,
      rev: 0,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  const productMap = new Map(products.map((p) => [p.sku, p]));

  // 7. Customers (7 Wilayah Operasional)
  const customers = [
    {
      id: 'cst_cherry_clp_01',
      businessId,
      code: 'CHERRY-CLP',
      name: 'Cherry Petshop',
      contactName: 'Ibu Cherry',
      address: 'Jl. Mangga No. 27 RT 01 RW 07, Desa Adipala, Kec. Adipala, Kab. Cilacap Jateng',
      shippingAddress: 'Jl. Mangga No. 27 RT 01 RW 07, Desa Adipala, Kec. Adipala, Kab. Cilacap Jateng',
      billingAddress: 'Jl. Mangga No. 27 RT 01 RW 07, Desa Adipala, Kec. Adipala, Kab. Cilacap Jateng',
      phone: '081234567803',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Cilacap',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 60,
    },
    {
      id: 'cst_gukguk_smg_01',
      businessId,
      code: 'GUKGUK-SMG',
      name: 'Gukguk Meong (Ny. Noni & Ny. Maria)',
      contactName: 'Ny. Noni & Ny. Maria',
      address: 'Kampung baris 505, Karangturi, Semarang Timur, Kota Semarang',
      shippingAddress: 'Kampung baris 505, Karangturi, Semarang Timur, Kota Semarang',
      billingAddress: 'Kampung baris 505, Karangturi, Semarang Timur, Kota Semarang',
      phone: '081234567805',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Semarang',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 45,
    },
    {
      id: 'cst_aulia_bjn_01',
      businessId,
      code: 'AULIA-BJN',
      name: 'Aulia Petshop (Drh. Aulia)',
      contactName: 'Drh. Aulia',
      address: 'Jl Ahmad Yani, No.2 Jambean, Sukorejo, Kec. Bojonegoro',
      shippingAddress: 'Jl Ahmad Yani, No.2 Jambean, Sukorejo, Kec. Bojonegoro',
      billingAddress: 'Jl Ahmad Yani, No.2 Jambean, Sukorejo, Kec. Bojonegoro',
      phone: '081234567804',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Bojonegoro',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 45,
    },
    {
      id: 'cst_aura_lmg_01',
      businessId,
      code: 'AURA-LMG',
      name: 'Aura Petshop (Lamongan)',
      contactName: 'Owner Aura Petshop',
      address: 'Jl. Lamongan Raya, Kab. Lamongan, Jawa Timur',
      shippingAddress: 'Jl. Lamongan Raya, Kab. Lamongan, Jawa Timur',
      billingAddress: 'Jl. Lamongan Raya, Kab. Lamongan, Jawa Timur',
      phone: '081234567807',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Lamongan',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 60,
    },
    {
      id: 'cst_aulia_tbn_01',
      businessId,
      code: 'AULIA-TBN',
      name: 'Aulia Petshop (Tuban)',
      contactName: 'Bp. Hamid (drh. Aulia Insani Bojonegoro)',
      address: 'Jl. Raya Tuban, Kab. Tuban, Jawa Timur',
      shippingAddress: 'Jl. Raya Tuban, Kab. Tuban, Jawa Timur',
      billingAddress: 'Jl. Raya Tuban, Kab. Tuban, Jawa Timur',
      phone: '081234567808',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Tuban',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 60,
    },
    {
      id: 'cst_timika_pap_01',
      businessId,
      code: 'TIMIKA-PAP',
      name: 'Pak Anwar (Meka Petshop Timika)',
      contactName: 'Pak Anwar',
      address: 'Jl. Cenderawasih, Timika, Papua',
      shippingAddress: 'Jl. Cenderawasih, Timika, Papua',
      billingAddress: 'Jl. Cenderawasih, Timika, Papua',
      phone: '085244972449',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Timika, Papua',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 90,
    },
    {
      id: 'cst_vetma_blt_01',
      businessId,
      code: 'VETMA-BLT',
      name: 'Drh Nela Dwi (Vetma Petshop)',
      contactName: 'Drh. Nela Dwi',
      address: 'Jl. Cemara perum cemara No.ruko 1, Tlumpu, Kec. Sukorejo, Kota Blitar',
      shippingAddress: 'Jl. Cemara perum cemara No.ruko 1, Tlumpu, Kec. Sukorejo, Kota Blitar',
      billingAddress: 'Jl. Cemara perum cemara No.ruko 1, Tlumpu, Kec. Sukorejo, Kota Blitar',
      phone: '081234567801',
      email: null,
      assignedSalesId: diniaId,
      pipelineStage: 'REPEAT',
      notes: 'Pelanggan aktif repeat order wilayah Kota Blitar',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: now,
      deletedAt: null,
      intervalDays: 45,
    },
  ];

  const customerMap = new Map(customers.map((c) => [c.code, c]));

  // 8. CustomerMinPrice
  const customerMinPrices = [];
  const minPriceDefinitions = [
    { custCode: 'CHERRY-CLP', sku: 'BC-25L', minPrice: BigInt(73500) },
    { custCode: 'CHERRY-CLP', sku: 'BC-5.5L', minPrice: BigInt(21000) },
    { custCode: 'GUKGUK-SMG', sku: 'BC-25L', minPrice: BigInt(76500) },
    { custCode: 'GUKGUK-SMG', sku: 'BC-10L', minPrice: BigInt(38500) },
    { custCode: 'GUKGUK-SMG', sku: 'BC-5.5L', minPrice: BigInt(21750) },
    { custCode: 'AULIA-BJN', sku: 'BC-25L', minPrice: BigInt(75500) },
    { custCode: 'AULIA-BJN', sku: 'BC-10L', minPrice: BigInt(38000) },
    { custCode: 'AULIA-BJN', sku: 'BC-5.5L', minPrice: BigInt(21500) },
    { custCode: 'AURA-LMG', sku: 'BC-25L', minPrice: BigInt(75000) },
    { custCode: 'AURA-LMG', sku: 'BC-10L', minPrice: BigInt(38000) },
    { custCode: 'AURA-LMG', sku: 'BC-5.5L', minPrice: BigInt(21500) },
    { custCode: 'AULIA-TBN', sku: 'BC-25L', minPrice: BigInt(75500) },
    { custCode: 'AULIA-TBN', sku: 'BC-10L', minPrice: BigInt(38000) },
    { custCode: 'AULIA-TBN', sku: 'BC-5.5L', minPrice: BigInt(21500) },
    { custCode: 'TIMIKA-PAP', sku: 'BC-25L', minPrice: BigInt(72500) },
    { custCode: 'TIMIKA-PAP', sku: 'BC-10L', minPrice: BigInt(37000) },
    { custCode: 'TIMIKA-PAP', sku: 'BC-5.5L', minPrice: BigInt(21750) },
    { custCode: 'VETMA-BLT', sku: 'BC-25L', minPrice: BigInt(68500) },
    { custCode: 'VETMA-BLT', sku: 'BC-10L', minPrice: BigInt(34000) },
    { custCode: 'VETMA-BLT', sku: 'BC-5.5L', minPrice: BigInt(19750) },
  ];

  let cmpIdx = 1;
  for (const mp of minPriceDefinitions) {
    const cust = customerMap.get(mp.custCode);
    const prod = productMap.get(mp.sku);
    if (cust && prod) {
      customerMinPrices.push({
        id: `cmp_${String(cmpIdx++).padStart(4, '0')}`,
        businessId,
        customerId: cust.id,
        productId: prod.id,
        minPrice: mp.minPrice,
        note: `Batas harga kesepakatan ${cust.name}`,
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: now,
      });
    }
  }

  // 9. Price History (Jejak Sejarah Perubahan Harga Produk)
  const priceHistories = [];
  let phIdx = 1;
  for (const p of products) {
    priceHistories.push({
      id: `ph_${String(phIdx++).padStart(4, '0')}`,
      businessId,
      productId: p.id,
      customerId: null,
      field: 'BASE',
      oldValue: p.basePrice - BigInt(2000),
      newValue: p.basePrice,
      reason: 'Penyesuaian kenaikan harga baku & operasional per arsip invoice resmi BentoCat',
      changedById: diniaId,
      createdAt: new Date('2026-01-01T08:00:00Z'),
    });
    priceHistories.push({
      id: `ph_${String(phIdx++).padStart(4, '0')}`,
      businessId,
      productId: p.id,
      customerId: null,
      field: 'COST',
      oldValue: p.costPrice - BigInt(1500),
      newValue: p.costPrice,
      reason: 'Penyesuaian HPP modal pabrik vendor Mojoagung',
      changedById: diniaId,
      createdAt: new Date('2026-01-01T08:00:00Z'),
    });
  }

  // 10. Purchase Order Awal (Stok Pengadaan ke Mojoagung)
  const poId = 'po_mojo_init_01';
  const poItems = [
    { productId: productMap.get('BC-25L')!.id, qty: 1500, unitCost: BigInt(63250), lineTotal: BigInt(63250 * 1500) },
    { productId: productMap.get('BC-10L')!.id, qty: 1800, unitCost: BigInt(32000), lineTotal: BigInt(32000 * 1800) },
    { productId: productMap.get('BC-5.5L')!.id, qty: 2500, unitCost: BigInt(18500), lineTotal: BigInt(18500 * 2500) },
    { productId: productMap.get('ZEO-01')!.id, qty: 500, unitCost: BigInt(9500), lineTotal: BigInt(9500 * 500) },
    { productId: productMap.get('ZEO-02')!.id, qty: 600, unitCost: BigInt(9500), lineTotal: BigInt(9500 * 600) },
    { productId: productMap.get('ZEO-03')!.id, qty: 600, unitCost: BigInt(9500), lineTotal: BigInt(9500 * 600) },
    { productId: productMap.get('ZEO-GRANUL')!.id, qty: 500, unitCost: BigInt(15000), lineTotal: BigInt(15000 * 500) },
  ];
  const poSubtotal = poItems.reduce((acc, it) => acc + it.lineTotal, BigInt(0));
  const poShipping = BigInt(3500000);
  const poGrandTotal = poSubtotal + poShipping;

  const purchaseOrders = [
    {
      id: poId,
      businessId,
      vendorId: vendorMojoId,
      poNo: 'MOJO/PO/01/01/2025/0001',
      status: 'RECEIVED',
      orderDate: new Date('2025-01-05T09:00:00Z'),
      expectedDate: new Date('2025-01-10T15:00:00Z'),
      subtotal: poSubtotal,
      shippingCost: poShipping,
      total: poGrandTotal,
      paidTotal: poGrandTotal,
      notes: 'Pengadaan stok awal pasir BentoCat dan Zeolite dari Vendor Mojoagung',
      createdById: diniaId,
      createdAt: new Date('2025-01-05T09:00:00Z'),
      updatedAt: now,
      deletedAt: null,
    },
  ];

  const purchaseOrderItems = poItems.map((it, idx) => ({
    id: `poi_${String(idx + 1).padStart(4, '0')}`,
    purchaseOrderId: poId,
    productId: it.productId,
    qty: it.qty,
    receivedQty: it.qty,
    unitCost: it.unitCost,
    lineTotal: it.lineTotal,
    createdAt: new Date('2025-01-05T09:00:00Z'),
  }));

  // 11. Transaksi Riil 3 Dokumen Terakhir per Kota (20 Transaksi)
  interface RawTxItem {
    sku: string;
    qty: number;
    unitPrice: bigint;
  }

  interface RawTx {
    custCode: string;
    docNo: number;
    orderNo: string;
    invoiceNo: string;
    deliveryNo: string;
    orderDate: Date;
    shippingCharge: bigint;
    shippingCost: bigint;
    notes: string;
    items: RawTxItem[];
  }

  const rawTransactions: RawTx[] = [
    // --- CILACAP ---
    {
      custCode: 'CHERRY-CLP',
      docNo: 26,
      orderNo: 'CHERRY/INV/26/04/2026/0026',
      invoiceNo: 'INV/CLP/2026/04/0026',
      deliveryNo: 'SJ/CLP/2026/04/0026',
      orderDate: new Date('2026-04-14T08:00:00Z'),
      shippingCharge: BigInt(1900000),
      shippingCost: BigInt(1900000),
      notes: 'Repeat Order Dok 26 Cherry Petshop Cilacap',
      items: [
        { sku: 'BC-25L', qty: 320, unitPrice: BigInt(70500) },
        { sku: 'BC-5.5L', qty: 500, unitPrice: BigInt(20000) },
      ],
    },
    {
      custCode: 'CHERRY-CLP',
      docNo: 27,
      orderNo: 'CHERRY/INV/27/06/2026/0027',
      invoiceNo: 'INV/CLP/2026/06/0027',
      deliveryNo: 'SJ/CLP/2026/06/0027',
      orderDate: new Date('2026-06-24T08:00:00Z'),
      shippingCharge: BigInt(1900000),
      shippingCost: BigInt(1900000),
      notes: 'Repeat Order Dok 27 Cherry Petshop Cilacap',
      items: [
        { sku: 'BC-25L', qty: 320, unitPrice: BigInt(73500) },
        { sku: 'BC-5.5L', qty: 500, unitPrice: BigInt(21000) },
      ],
    },
    {
      custCode: 'CHERRY-CLP',
      docNo: 28,
      orderNo: 'CHERRY/INV/28/08/2026/0028',
      invoiceNo: 'INV/CLP/2026/08/0028',
      deliveryNo: 'SJ/CLP/2026/08/0028',
      orderDate: new Date('2026-08-26T08:00:00Z'),
      shippingCharge: BigInt(1900000),
      shippingCost: BigInt(1900000),
      notes: 'Repeat Order Dok 28 REVISI Cherry Petshop Cilacap',
      items: [
        { sku: 'BC-25L', qty: 300, unitPrice: BigInt(73500) },
        { sku: 'BC-5.5L', qty: 500, unitPrice: BigInt(21000) },
      ],
    },

    // --- SEMARANG ---
    {
      custCode: 'GUKGUK-SMG',
      docNo: 32,
      orderNo: 'GUKGUK/INV/32/02/2026/0032',
      invoiceNo: 'INV/SMG/2026/02/0032',
      deliveryNo: 'SJ/SMG/2026/02/0032',
      orderDate: new Date('2026-02-21T08:00:00Z'),
      shippingCharge: BigInt(1450000),
      shippingCost: BigInt(1450000),
      notes: 'Repeat Order Dok 32 Semarang (Ny. Noni & Ny. Maria)',
      items: [
        { sku: 'BC-25L', qty: 410, unitPrice: BigInt(73000) },
      ],
    },
    {
      custCode: 'GUKGUK-SMG',
      docNo: 33,
      orderNo: 'GUKGUK/INV/33/02/2026/0033',
      invoiceNo: 'INV/SMG/2026/02/0033',
      deliveryNo: 'SJ/SMG/2026/02/0033',
      orderDate: new Date('2026-02-21T10:00:00Z'),
      shippingCharge: BigInt(1450000),
      shippingCost: BigInt(1450000),
      notes: 'Repeat Order Dok 33 Semarang (Ny. Noni & Ny. Maria)',
      items: [
        { sku: 'BC-25L', qty: 340, unitPrice: BigInt(73000) },
        { sku: 'BC-10L', qty: 110, unitPrice: BigInt(36500) },
        { sku: 'BC-5.5L', qty: 110, unitPrice: BigInt(20750) },
      ],
    },
    {
      custCode: 'GUKGUK-SMG',
      docNo: 35,
      orderNo: 'GUKGUK/INV/35/10/2026/0035',
      invoiceNo: 'INV/SMG/2026/10/0035',
      deliveryNo: 'SJ/SMG/2026/10/0035',
      orderDate: new Date('2026-10-05T08:00:00Z'),
      shippingCharge: BigInt(1450000),
      shippingCost: BigInt(1450000),
      notes: 'Repeat Order Dok 35 Semarang (Ny. Noni & Ny. Maria)',
      items: [
        { sku: 'BC-25L', qty: 373, unitPrice: BigInt(76500) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(38500) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(21750) },
      ],
    },

    // --- BOJONEGORO ---
    {
      custCode: 'AULIA-BJN',
      docNo: 17,
      orderNo: 'AULIA/INV/17/03/2026/0017',
      invoiceNo: 'INV/BJN/2026/03/0017',
      deliveryNo: 'SJ/BJN/2026/03/0017',
      orderDate: new Date('2026-03-03T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 17 Aulia Petshop Bojonegoro',
      items: [
        { sku: 'BC-25L', qty: 325, unitPrice: BigInt(72000) },
        { sku: 'BC-10L', qty: 170, unitPrice: BigInt(36000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500) },
      ],
    },
    {
      custCode: 'AULIA-BJN',
      docNo: 18,
      orderNo: 'AULIA/INV/18/04/2026/0018',
      invoiceNo: 'INV/BJN/2026/04/0018',
      deliveryNo: 'SJ/BJN/2026/04/0018',
      orderDate: new Date('2026-04-21T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 18 Aulia Petshop Bojonegoro',
      items: [
        { sku: 'BC-25L', qty: 335, unitPrice: BigInt(72000) },
        { sku: 'BC-10L', qty: 130, unitPrice: BigInt(36000) },
        { sku: 'BC-5.5L', qty: 150, unitPrice: BigInt(20500) },
      ],
    },
    {
      custCode: 'AULIA-BJN',
      docNo: 19,
      orderNo: 'AULIA/INV/19/09/2026/0019',
      invoiceNo: 'INV/BJN/2026/09/0019',
      deliveryNo: 'SJ/BJN/2026/09/0019',
      orderDate: new Date('2026-09-26T08:00:00Z'),
      shippingCharge: BigInt(800000),
      shippingCost: BigInt(800000),
      notes: 'Repeat Order Dok 19 REVISI Aulia Petshop Bojonegoro',
      items: [
        { sku: 'BC-25L', qty: 360, unitPrice: BigInt(75500) },
        { sku: 'BC-10L', qty: 105, unitPrice: BigInt(38000) },
        { sku: 'BC-5.5L', qty: 105, unitPrice: BigInt(21500) },
      ],
    },

    // --- LAMONGAN ---
    {
      custCode: 'AURA-LMG',
      docNo: 9,
      orderNo: 'AURA/INV/09/05/2025/0009',
      invoiceNo: 'INV/LMG/2025/05/0009',
      deliveryNo: 'SJ/LMG/2025/05/0009',
      orderDate: new Date('2025-05-30T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 9 Aura Petshop Lamongan',
      items: [
        { sku: 'BC-25L', qty: 310, unitPrice: BigInt(72000) },
        { sku: 'BC-10L', qty: 200, unitPrice: BigInt(36000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500) },
      ],
    },
    {
      custCode: 'AURA-LMG',
      docNo: 10,
      orderNo: 'AURA/INV/10/11/2025/0010',
      invoiceNo: 'INV/LMG/2025/11/0010',
      deliveryNo: 'SJ/LMG/2025/11/0010',
      orderDate: new Date('2025-11-20T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 10 Aura Petshop Lamongan',
      items: [
        { sku: 'BC-25L', qty: 320, unitPrice: BigInt(72000) },
        { sku: 'BC-10L', qty: 200, unitPrice: BigInt(36000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500) },
      ],
    },
    {
      custCode: 'AURA-LMG',
      docNo: 11,
      orderNo: 'AURA/INV/11/06/2026/0011',
      invoiceNo: 'INV/LMG/2026/06/0011',
      deliveryNo: 'SJ/LMG/2026/06/0011',
      orderDate: new Date('2026-06-17T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 11 Aura Petshop Lamongan',
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(75000) },
        { sku: 'BC-10L', qty: 135, unitPrice: BigInt(38000) },
        { sku: 'BC-5.5L', qty: 270, unitPrice: BigInt(21500) },
      ],
    },

    // --- TUBAN ---
    {
      custCode: 'AULIA-TBN',
      docNo: 9,
      orderNo: 'TUBAN/INV/09/07/2025/0009',
      invoiceNo: 'INV/TBN/2025/07/0009',
      deliveryNo: 'SJ/TBN/2025/07/0009',
      orderDate: new Date('2025-07-12T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 9 Tuban (drh. Aulia Insani / Bp. Hamid)',
      items: [
        { sku: 'BC-25L', qty: 340, unitPrice: BigInt(72000) },
        { sku: 'BC-10L', qty: 120, unitPrice: BigInt(36000) },
        { sku: 'BC-5.5L', qty: 200, unitPrice: BigInt(20500) },
      ],
    },
    {
      custCode: 'AULIA-TBN',
      docNo: 10,
      orderNo: 'TUBAN/INV/10/01/2026/0010',
      invoiceNo: 'INV/TBN/2026/01/0010',
      deliveryNo: 'SJ/TBN/2026/01/0010',
      orderDate: new Date('2026-01-15T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 10 Tuban (drh. Aulia Insani / Bp. Hamid)',
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(72000) },
        { sku: 'BC-10L', qty: 150, unitPrice: BigInt(36000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(20500) },
      ],
    },
    {
      custCode: 'AULIA-TBN',
      docNo: 11,
      orderNo: 'TUBAN/INV/11/08/2026/0011',
      invoiceNo: 'INV/TBN/2026/08/0011',
      deliveryNo: 'SJ/TBN/2026/08/0011',
      orderDate: new Date('2026-08-03T08:00:00Z'),
      shippingCharge: BigInt(850000),
      shippingCost: BigInt(850000),
      notes: 'Repeat Order Dok 11 Tuban (drh. Aulia Insani / Bp. Hamid)',
      items: [
        { sku: 'BC-25L', qty: 330, unitPrice: BigInt(75500) },
        { sku: 'BC-10L', qty: 150, unitPrice: BigInt(38000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(21500) },
      ],
    },

    // --- TIMIKA PAPUA ---
    {
      custCode: 'TIMIKA-PAP',
      docNo: 3,
      orderNo: 'MEKA/INV/03/02/2026/0003',
      invoiceNo: 'INV/TMK/2026/02/0003',
      deliveryNo: 'SJ/TMK/2026/02/0003',
      orderDate: new Date('2026-02-06T08:00:00Z'),
      shippingCharge: BigInt(500000),
      shippingCost: BigInt(500000),
      notes: 'Repeat Order Dok 3 Pak Anwar (Meka Petshop Timika)',
      items: [
        { sku: 'BC-25L', qty: 10, unitPrice: BigInt(69500) },
        { sku: 'BC-10L', qty: 45, unitPrice: BigInt(35000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(20750) },
        { sku: 'ZEO-03', qty: 5, unitPrice: BigInt(11000) },
      ],
    },
    {
      custCode: 'TIMIKA-PAP',
      docNo: 4,
      orderNo: 'MEKA/INV/04/05/2026/0004',
      invoiceNo: 'INV/TMK/2026/05/0004',
      deliveryNo: 'SJ/TMK/2026/05/0004',
      orderDate: new Date('2026-05-08T08:00:00Z'),
      shippingCharge: BigInt(750000),
      shippingCost: BigInt(750000),
      notes: 'Repeat Order Dok 4 Pak Anwar (Meka Petshop Timika)',
      items: [
        { sku: 'BC-25L', qty: 30, unitPrice: BigInt(69500) },
        { sku: 'BC-10L', qty: 100, unitPrice: BigInt(35000) },
        { sku: 'BC-5.5L', qty: 100, unitPrice: BigInt(20750) },
        { sku: 'ZEO-02', qty: 5, unitPrice: BigInt(11000) },
        { sku: 'ZEO-03', qty: 5, unitPrice: BigInt(11000) },
      ],
    },
    {
      custCode: 'TIMIKA-PAP',
      docNo: 5,
      orderNo: 'MEKA/INV/05/08/2026/0005',
      invoiceNo: 'INV/TMK/2026/08/0005',
      deliveryNo: 'SJ/TMK/2026/08/0005',
      orderDate: new Date('2026-08-03T08:00:00Z'),
      shippingCharge: BigInt(750000),
      shippingCost: BigInt(750000),
      notes: 'Repeat Order Dok 5 Pak Anwar (Meka Petshop Timika)',
      items: [
        { sku: 'BC-25L', qty: 75, unitPrice: BigInt(72500) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(37000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(21750) },
      ],
    },

    // --- BLITAR ---
    {
      custCode: 'VETMA-BLT',
      docNo: 1,
      orderNo: 'VETMA/INV/01/12/2025/0001',
      invoiceNo: 'INV/BLT/2025/12/0001',
      deliveryNo: 'SJ/BLT/2025/12/0001',
      orderDate: new Date('2025-12-31T08:00:00Z'),
      shippingCharge: BigInt(100000), // Biaya bongkar
      shippingCost: BigInt(100000),
      notes: 'Repeat Order Dok 1 Vetma Petshop Blitar (Termasuk biaya bongkar Rp 100.000)',
      items: [
        { sku: 'BC-25L', qty: 80, unitPrice: BigInt(68500) },
        { sku: 'BC-10L', qty: 50, unitPrice: BigInt(34000) },
        { sku: 'BC-5.5L', qty: 50, unitPrice: BigInt(19750) },
      ],
    },
    {
      custCode: 'VETMA-BLT',
      docNo: 2,
      orderNo: 'VETMA/INV/02/05/2026/0002',
      invoiceNo: 'INV/BLT/2026/05/0002',
      deliveryNo: 'SJ/BLT/2026/05/0002',
      orderDate: new Date('2026-05-02T08:00:00Z'),
      shippingCharge: BigInt(100000), // Biaya bongkar
      shippingCost: BigInt(100000),
      notes: 'Repeat Order Dok 2 Vetma Petshop Blitar (Termasuk biaya bongkar Rp 100.000)',
      items: [
        { sku: 'BC-10L', qty: 250, unitPrice: BigInt(34000) },
        { sku: 'BC-5.5L', qty: 250, unitPrice: BigInt(19750) },
      ],
    },
  ];

  const orders = [];
  const orderItems = [];
  const invoices = [];
  const payments = [];
  const shipments = [];

  let oIdx = 1;
  let oiIdx = 1;
  let invIdx = 1;
  let payIdx = 1;
  let shpIdx = 1;

  for (const raw of rawTransactions) {
    const cust = customerMap.get(raw.custCode)!;
    const orderId = `ord_${String(oIdx++).padStart(4, '0')}`;
    const invoiceId = `inv_${String(invIdx++).padStart(4, '0')}`;
    const shipmentId = `shp_${String(shpIdx++).padStart(4, '0')}`;

    let subtotal = BigInt(0);
    const orderItemsLocal = [];

    for (let i = 0; i < raw.items.length; i++) {
      const it = raw.items[i];
      const prod = productMap.get(it.sku)!;
      const lineSubtotal = it.unitPrice * BigInt(it.qty);
      const lineNet = lineSubtotal;
      subtotal += lineNet;

      const orderItem = {
        id: `oit_${String(oiIdx++).padStart(4, '0')}`,
        businessId,
        orderId,
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        qty: it.qty,
        listPrice: it.unitPrice,
        unitPrice: it.unitPrice,
        discountType: 'NONE',
        discountValue: BigInt(0),
        discountSource: 'MANUAL',
        lineSubtotal,
        lineDiscount: BigInt(0),
        lineNet,
        costPrice: prod.costPrice,
        floorPrice: prod.minPrice,
        belowMin: false,
        sortOrder: i + 1,
        createdAt: raw.orderDate,
      };
      orderItems.push(orderItem);
      orderItemsLocal.push(orderItem);
    }

    const grandTotal = subtotal + raw.shippingCharge;
    const dpAmount = grandTotal / BigInt(2); // DP 50%
    const pelunasanAmount = grandTotal - dpAmount; // Sisa 50%
    const dueDate = new Date(raw.orderDate.getTime() + 14 * 24 * 3600 * 1000);

    // 1. Order
    orders.push({
      id: orderId,
      businessId,
      customerId: cust.id,
      salesId: diniaId,
      status: 'COMPLETED',
      version: 1,
      customerSeq: raw.docNo,
      orderNo: raw.orderNo,
      orderDate: raw.orderDate,
      deliveryAddress: cust.address,
      notes: raw.notes,
      subtotal,
      discountTotal: BigInt(0),
      shippingCharge: raw.shippingCharge,
      grandTotal,
      dpBps: 5000,
      dpAmount,
      paidTotal: grandTotal,
      repeatIntervalDays: cust.intervalDays,
      createdAt: raw.orderDate,
      updatedAt: raw.orderDate,
      deletedAt: null,
    });

    // 2. Invoice (FINAL & APPROVED)
    invoices.push({
      id: invoiceId,
      businessId,
      orderId,
      customerId: cust.id,
      type: 'FINAL',
      status: 'APPROVED',
      version: 1,
      number: raw.invoiceNo,
      amount: grandTotal,
      paidAmount: grandTotal,
      issueDate: raw.orderDate,
      dueDate,
      theme: 'PROFESIONAL',
      pdfPath: null,
      requestedById: diniaId,
      approvedById: diniaId,
      approvedAt: raw.orderDate,
      rejectionReason: null,
      createdAt: raw.orderDate,
      updatedAt: raw.orderDate,
      deletedAt: null,
    });

    // 3. Payment 1: DP 50%
    payments.push({
      id: `pay_${String(payIdx++).padStart(4, '0')}`,
      businessId,
      orderId,
      invoiceId,
      type: 'RECEIPT',
      method: 'TRANSFER',
      status: 'VERIFIED',
      amount: dpAmount,
      paidAt: raw.orderDate,
      reference: `TRF-BCA-DP-${raw.docNo}`,
      notes: `Down Payment (DP 50%) via transfer BCA 0901422817 a.n. DHIKO HERLAMBANG untuk pesanan ${raw.orderNo}`,
      proofPath: null,
      verifiedAt: raw.orderDate,
      verifiedById: diniaId,
      createdById: diniaId,
      createdAt: raw.orderDate,
      updatedAt: raw.orderDate,
      deletedAt: null,
    });

    // 4. Payment 2: Pelunasan 50% (3-5 hari kemudian saat muatan sampai)
    const pelunasanDate = new Date(raw.orderDate.getTime() + 4 * 24 * 3600 * 1000);
    payments.push({
      id: `pay_${String(payIdx++).padStart(4, '0')}`,
      businessId,
      orderId,
      invoiceId,
      type: 'RECEIPT',
      method: 'TRANSFER',
      status: 'VERIFIED',
      amount: pelunasanAmount,
      paidAt: pelunasanDate,
      reference: `TRF-BCA-LUNAS-${raw.docNo}`,
      notes: `Pelunasan sisa 50% via transfer BCA 0901422817 a.n. DHIKO HERLAMBANG untuk pesanan ${raw.orderNo}`,
      proofPath: null,
      verifiedAt: pelunasanDate,
      verifiedById: diniaId,
      createdById: diniaId,
      createdAt: pelunasanDate,
      updatedAt: pelunasanDate,
      deletedAt: null,
    });

    // 5. Shipment
    const shippedDate = new Date(raw.orderDate.getTime() + 2 * 24 * 3600 * 1000);
    const deliveredDate = new Date(raw.orderDate.getTime() + 4 * 24 * 3600 * 1000);
    shipments.push({
      id: shipmentId,
      businessId,
      orderId,
      deliveryNo: raw.deliveryNo,
      method: 'TRANSPORT_VENDOR',
      transporterId: vendorTransId,
      trackingNo: `TRK-${raw.docNo}`,
      driverName: 'Armada Truk Logistik BentoCat',
      vehiclePlate: 'AG 8899 BC',
      receiverName: cust.contactName,
      status: 'DELIVERED',
      actualCost: raw.shippingCost,
      shippedAt: shippedDate,
      deliveredAt: deliveredDate,
      notes: `Pengiriman pesanan ${raw.orderNo} ke ${cust.address}`,
      createdAt: shippedDate,
      updatedAt: deliveredDate,
    });
  }

  // 12. DocumentCounter (ORDER_SEQ per Customer)
  const lastSeqs: Record<string, number> = {
    'GUKGUK-SMG': 35,
    'CHERRY-CLP': 28,
    'AULIA-BJN': 19,
    'AURA-LMG': 11,
    'AULIA-TBN': 11,
    'TIMIKA-PAP': 5,
    'VETMA-BLT': 2,
  };

  const documentCounters = [];
  let dcIdx = 1;
  for (const [cCode, lSeq] of Object.entries(lastSeqs)) {
    const cust = customerMap.get(cCode)!;
    documentCounters.push({
      id: `dc_${String(dcIdx++).padStart(4, '0')}`,
      businessId,
      scope: 'ORDER_SEQ',
      scopeId: cust.id,
      lastSeq: lSeq,
    });
  }

  // 13. Reminders (Pengingat Siklus Repeat Order)
  const reminders = [];
  let remIdx = 1;
  for (const cust of customers) {
    // cari transaksi terakhir pelanggan
    const custTxs = rawTransactions.filter((t) => t.custCode === cust.code);
    const lastTx = custTxs[custTxs.length - 1];
    const lastDate = lastTx ? lastTx.orderDate : new Date('2026-01-01T08:00:00Z');
    const nextDue = new Date(lastDate.getTime() + cust.intervalDays * 24 * 3600 * 1000);

    reminders.push({
      id: `rem_${String(remIdx++).padStart(4, '0')}`,
      businessId,
      customerId: cust.id,
      productId: null,
      salesId: diniaId,
      intervalDays: cust.intervalDays,
      lastOrderDate: lastDate,
      nextDueDate: nextDue,
      status: 'ACTIVE',
      source: 'AUTO',
      snoozedUntil: null,
      lastNotifiedAt: null,
      escalatedAt: null,
      note: `Pengingat otomatis repeat order berkala (${cust.intervalDays} hari) pelanggan ${cust.name}`,
    });
  }

  // 14. Audit Log
  const auditLogs = [
    {
      id: 'aud_init_01',
      businessId,
      actorId: diniaId,
      action: 'BUSINESS_EXPORT_PACKAGE_INITIALIZE',
      entityType: 'Business',
      entityId: businessId,
      oldData: null,
      newData: { code: businessCode, name: 'BentoCat Premium Cat Litter' },
      createdAt: now,
    },
    {
      id: 'aud_init_02',
      businessId,
      actorId: diniaId,
      action: 'OPERATIONAL_TRANSACTIONS_RESTORED',
      entityType: 'Order',
      entityId: orders[orders.length - 1].id,
      oldData: null,
      newData: { count: orders.length, scope: '7 Cities Real PDF Invoices' },
      createdAt: now,
    },
  ];

  // 15. Kumpulkan Semua Tabel ke Dictionary Data
  const tablesData: Record<string, Record<string, unknown>[]> = {
    Business: businesses,
    BankAccount: bankAccounts,
    User: users,
    Category: categories,
    Vendor: vendors,
    Product: products,
    ProductImage: [],
    PriceHistory: priceHistories,
    Customer: customers.map(({ intervalDays, ...rest }) => rest),
    CustomerMinPrice: customerMinPrices,
    CustomerPromo: [],
    CrmInteraction: [],
    CrmTask: [],
    OwnerSalesNote: [],
    SalesTarget: [],
    CommissionTier: [],
    Order: orders,
    OrderItem: orderItems,
    OrderCost: [],
    Invoice: invoices,
    Payment: payments,
    Shipment: shipments,
    CreditNote: [],
    CreditNoteItem: [],
    CustomerCreditEntry: [],
    PurchaseOrder: purchaseOrders,
    PurchaseOrderItem: purchaseOrderItems,
    VendorPayment: [],
    StockMovement: [],
    CommissionEntry: [],
    Reminder: reminders,
    Catalog: [],
    CatalogItem: [],
    DocumentCounter: documentCounters,
    AuditLog: auditLogs,
  };

  // 16. Format ke NDJSON dan Zippable
  const zipFiles: Zippable = {};
  const manifestTables: Record<string, { file: string; rows: number; sha256: string }> = {};

  for (const spec of TABLES) {
    if (spec.scope === 'system-only') continue;

    const rows = tablesData[spec.model] || [];
    const ndjsonLines = rows.map((r) => toJsonLine(r));
    const ndjsonContent = ndjsonLines.join('\n');
    const ndjsonBytes = strToU8(ndjsonContent);
    const sha256 = crypto.createHash('sha256').update(ndjsonContent).digest('hex');

    const fileName = `${spec.model}.ndjson`;
    zipFiles[`data/${fileName}`] = ndjsonBytes;

    manifestTables[spec.model] = {
      file: `data/${fileName}`,
      rows: rows.length,
      sha256,
    };
  }

  // 17. Buat Manifest
  const manifest = {
    format: 'omnicat-export',
    formatVersion: 1,
    appVersion: '1.0.0',
    lastMigration: '20261110000003_catalog_same_business_guard',
    exportedAt: now.toISOString(),
    exportedBy: 'dinia',
    scope: 'business',
    businessIds: [businessId],
    businessCodes: [businessCode],
    options: {
      includeUploads: false,
    },
    tables: manifestTables,
    uploads: {
      fileCount: 0,
      totalBytes: 0,
      files: [],
      missing: [],
    },
    containsSecrets: true,
  };

  const manifestStr = JSON.stringify(manifest, null, 2);
  zipFiles['manifest.json'] = strToU8(manifestStr);

  // 18. Kompresi ZIP
  const zipBuffer = zipSync(zipFiles, { level: 6 });

  // 19. Simpan Berkas
  const outputDir = path.resolve(process.cwd(), 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outFilename = `omnicat-export-business-BENTOCAT-${formatTimestamp(now)}.zip`;
  const outPath = path.join(outputDir, outFilename);
  fs.writeFileSync(outPath, Buffer.from(zipBuffer));

  // Simpan juga versi statis bernama omnicat-export-business-BENTOCAT.zip untuk kemudahan akses
  const staticPath = path.join(outputDir, 'omnicat-export-business-BENTOCAT.zip');
  fs.writeFileSync(staticPath, Buffer.from(zipBuffer));

  console.log('\n================ HASIL GENERASI TRANSFER DATA ================');
  console.log(`✓ Berkas ZIP berhasil dibuat: ${outPath}`);
  console.log(`✓ Alias berkas: ${staticPath}`);
  console.log(`✓ Ukuran: ${(zipBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`✓ Total Model Tabel: ${Object.keys(manifestTables).length}`);
  console.log(`✓ Total Transaksi Riil: ${orders.length} pesanan, ${invoices.length} invoice, ${payments.length} pembayaran`);
  console.log(`✓ Total Pelanggan: ${customers.length} kota`);
  console.log(`✓ Total Master Produk: ${products.length} SKU (Termasuk ZEO-GRANUL HPP Rp 15.000 & bobot 18 kg)`);
  console.log('===============================================================\n');
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

main().catch((err) => {
  console.error('Error generator:', err);
  process.exit(1);
});

