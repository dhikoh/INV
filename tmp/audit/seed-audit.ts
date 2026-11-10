import { prisma } from '../../src/lib/db';
import { hashPassword } from '../../src/lib/auth/password';
import {
  Role,
  InvoiceTheme,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
  PaymentType,
  PaymentMethod,
  PaymentStatus,
  ShipMethod,
  ShipStatus,
  DiscountType,
  DiscountSource,
} from '@prisma/client';
import { resetDb } from '../../tests/helpers/resetDb';

export const SECRET_HPP_A = 7313737;
export const SECRET_HPP_B = 7424242;
export const UNUSUAL_PATEN_A = 1234567;
export const UNUSUAL_PATEN_B = 2345678;

export async function seedAudit() {
  console.log('[seed-audit] Memulai pembersihan database tes...');
  await resetDb();

  console.log('[seed-audit] Menyiapkan entitas Usaha A dan Usaha B...');
  const businessA = await prisma.business.create({
    data: {
      id: 'biz_audit_a',
      code: 'AAA',
      name: 'Usaha Audit Alpha',
      legalName: 'PT Audit Alpha Perkasa',
      invoiceTheme: InvoiceTheme.PROFESIONAL,
      ppnEnabled: true,
      ppnRateBps: 1100,
      allowNegativeStock: false,
      defaultDpBps: 5000,
      requirePaidBeforeShip: false,
      defaultRepeatDays: 14,
      bankAccounts: {
        create: {
          id: 'bank_a1',
          bankName: 'BCA',
          accountNumber: '1112223334',
          accountHolder: 'PT Audit Alpha Perkasa',
          isDefault: true,
        },
      },
    },
  });

  const businessB = await prisma.business.create({
    data: {
      id: 'biz_audit_b',
      code: 'BBB',
      name: 'Usaha Audit Beta',
      legalName: 'CV Audit Beta Mandiri',
      invoiceTheme: InvoiceTheme.MODERN,
      ppnEnabled: false,
      ppnRateBps: 0,
      allowNegativeStock: false,
      defaultDpBps: 3000,
      requirePaidBeforeShip: true,
      defaultRepeatDays: 30,
      bankAccounts: {
        create: {
          id: 'bank_b1',
          bankName: 'MANDIRI',
          accountNumber: '9998887776',
          accountHolder: 'CV Audit Beta Mandiri',
          isDefault: true,
        },
      },
    },
  });

  console.log('[seed-audit] Menyiapkan pengguna (Super Admin & Sales)...');
  const commonPassHash = await hashPassword('Password12345!', 'superadmin');
  const superAdmin = await prisma.user.create({
    data: {
      id: 'usr_sa',
      username: 'superadmin',
      name: 'Super Admin Utama',
      passwordHash: commonPassHash,
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const salesA1 = await prisma.user.create({
    data: {
      id: 'usr_sales_a1',
      username: 'sales.a1',
      name: 'Sales Alpha Satu',
      passwordHash: await hashPassword('Password12345!', 'sales.a1'),
      role: Role.SALES,
      businessId: businessA.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const salesA2 = await prisma.user.create({
    data: {
      id: 'usr_sales_a2',
      username: 'sales.a2',
      name: 'Sales Alpha Dua',
      passwordHash: await hashPassword('Password12345!', 'sales.a2'),
      role: Role.SALES,
      businessId: businessA.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const salesB1 = await prisma.user.create({
    data: {
      id: 'usr_sales_b1',
      username: 'sales.b1',
      name: 'Sales Beta Satu',
      passwordHash: await hashPassword('Password12345!', 'sales.b1'),
      role: Role.SALES,
      businessId: businessB.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const salesB2 = await prisma.user.create({
    data: {
      id: 'usr_sales_b2',
      username: 'sales.b2',
      name: 'Sales Beta Dua',
      passwordHash: await hashPassword('Password12345!', 'sales.b2'),
      role: Role.SALES,
      businessId: businessB.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log('[seed-audit] Menyiapkan produk (termasuk nilai uji HPP & Harga Paten v2)...');
  // Usaha A products
  const prodA1 = await prisma.product.create({
    data: {
      id: 'prod_a1',
      businessId: businessA.id,
      sku: 'SKU-A1-STD',
      name: 'Produk A1 Standar',
      unit: 'DUS',
      costPrice: 70000n,
      basePrice: 100000n,
      minPrice: 85000n,
      stockQty: 100,
      reservedQty: 0,
      isActive: true,
    },
  });

  const prodA2 = await prisma.product.create({
    data: {
      id: 'prod_a2_secret',
      businessId: businessA.id,
      sku: 'SKU-A2-UNUSUAL',
      name: 'Produk A2 Paten Tujuh Digit',
      unit: 'DUS',
      costPrice: BigInt(SECRET_HPP_A),
      basePrice: 1500000n,
      minPrice: BigInt(UNUSUAL_PATEN_A),
      stockQty: 50,
      reservedQty: 0,
      isActive: true,
    },
  });

  const prodA3 = await prisma.product.create({
    data: {
      id: 'prod_a3_equal',
      businessId: businessA.id,
      sku: 'SKU-A3-EQUAL',
      name: 'Produk A3 Paten Sama HPP',
      unit: 'DUS',
      costPrice: 50000n,
      basePrice: 80000n,
      minPrice: 50000n, // D-5 test
      stockQty: 50,
      reservedQty: 0,
      isActive: true,
    },
  });

  const prodA4 = await prisma.product.create({
    data: {
      id: 'prod_a4_nostock',
      businessId: businessA.id,
      sku: 'SKU-A4-ZERO',
      name: 'Produk A4 Stok Nol',
      unit: 'DUS',
      costPrice: 40000n,
      basePrice: 60000n,
      minPrice: 50000n,
      stockQty: 0,
      reservedQty: 0,
      isActive: true,
    },
  });

  const prodA5 = await prisma.product.create({
    data: {
      id: 'prod_a5_inactive',
      businessId: businessA.id,
      sku: 'SKU-A5-INACTIVE',
      name: 'Produk A5 Nonaktif',
      unit: 'DUS',
      costPrice: 30000n,
      basePrice: 50000n,
      minPrice: 40000n,
      stockQty: 20,
      reservedQty: 0,
      isActive: false, // D-5 test
    },
  });

  // Usaha B products
  const prodB1 = await prisma.product.create({
    data: {
      id: 'prod_b1',
      businessId: businessB.id,
      sku: 'SKU-B1-STD',
      name: 'Produk B1 Standar',
      unit: 'PCS',
      costPrice: 45000n,
      basePrice: 80000n,
      minPrice: 60000n,
      stockQty: 200,
      reservedQty: 0,
      isActive: true,
    },
  });

  const prodB2 = await prisma.product.create({
    data: {
      id: 'prod_b2_secret',
      businessId: businessB.id,
      sku: 'SKU-B2-UNUSUAL',
      name: 'Produk B2 Paten Tujuh Digit',
      unit: 'PCS',
      costPrice: BigInt(SECRET_HPP_B),
      basePrice: 2600000n,
      minPrice: BigInt(UNUSUAL_PATEN_B),
      stockQty: 80,
      reservedQty: 0,
      isActive: true,
    },
  });

  console.log('[seed-audit] Menyiapkan customer, promo, dan harga khusus...');
  // Customer Usaha A
  const custA1 = await prisma.customer.create({
    data: {
      id: 'cust_a1_special',
      businessId: businessA.id,
      assignedSalesId: salesA1.id,
      code: 'ALPHACUST1',
      name: 'Toko Alpha Khusus & Promo',
      phone: '08111111111',
      shippingAddress: 'Jl. Alpha No. 1, Jakarta',
      customerMinPrices: {
        create: {
          productId: prodA1.id,
          businessId: businessA.id,
          minPrice: 110000n, // Lebih tinggi dari basePrice 100.000 (D-6 & C25)
        },
      },
      customerPromos: {
        create: {
          productId: prodA1.id,
          businessId: businessA.id,
          label: 'Promo Launching 10%',
          source: DiscountSource.PROMO,
          type: DiscountType.PERCENT,
          valueBps: 1000, // 10%
          validFrom: new Date(Date.now() - 7 * 86400000),
          validTo: new Date(Date.now() + 7 * 86400000), // aktif
        },
      },
    },
  });

  const custA2 = await prisma.customer.create({
    data: {
      id: 'cust_a2_expired',
      businessId: businessA.id,
      assignedSalesId: salesA2.id,
      code: 'ALPHACUST2',
      name: 'Toko Alpha Promo Kedaluwarsa',
      phone: '08111111112',
      shippingAddress: 'Jl. Alpha No. 2, Bandung',
      customerPromos: {
        create: {
          productId: prodA1.id,
          businessId: businessA.id,
          label: 'Diskon Kedaluwarsa 15rb',
          source: DiscountSource.PROMO,
          type: DiscountType.AMOUNT,
          valueAmount: 15000n,
          validFrom: new Date(Date.now() - 30 * 86400000),
          validTo: new Date(Date.now() - 1 * 86400000), // expired
        },
      },
    },
  });

  const custA3 = await prisma.customer.create({
    data: {
      id: 'cust_a3_regular',
      businessId: businessA.id,
      assignedSalesId: salesA1.id,
      code: 'ALPHACUST3',
      name: 'Toko Alpha Reguler',
      phone: '08111111113',
      shippingAddress: 'Jl. Alpha No. 3, Surabaya',
    },
  });

  // Customer Usaha B
  const custB1 = await prisma.customer.create({
    data: {
      id: 'cust_b1',
      businessId: businessB.id,
      assignedSalesId: salesB1.id,
      code: 'BETACUST1',
      name: 'Toko Beta Prima',
      phone: '08222222221',
      shippingAddress: 'Jl. Beta No. 1, Semarang',
    },
  });

  console.log('[seed-audit] Menyiapkan katalog sales...');
  const catA1 = await prisma.catalog.create({
    data: {
      id: 'cat_a1',
      businessId: businessA.id,
      ownerId: salesA1.id,
      customerId: custA1.id,
      title: 'Katalog Grosir Sales A1',
      note: 'Daftar harga spesial pelanggan setia',
      items: {
        create: [
          {
            productId: prodA1.id,
            price: 110000n,
            sortOrder: 0,
          },
          {
            productId: prodA2.id,
            price: 1500000n,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const catA2 = await prisma.catalog.create({
    data: {
      id: 'cat_a2',
      businessId: businessA.id,
      ownerId: salesA2.id,
      title: 'Katalog Ritel Sales A2',
      items: {
        create: [
          {
            productId: prodA1.id,
            price: 100000n,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const catB1 = await prisma.catalog.create({
    data: {
      id: 'cat_b1',
      businessId: businessB.id,
      ownerId: salesB1.id,
      title: 'Katalog Usaha B Sales B1',
      items: {
        create: [
          {
            productId: prodB1.id,
            price: 80000n,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  console.log('[seed-audit] Menyiapkan DocumentCounter...');
  await prisma.documentCounter.createMany({
    data: [
      {
        businessId: businessA.id,
        scope: 'ORDER_SEQ',
        scopeId: custA1.id,
        lastSeq: 1,
      },
      {
        businessId: businessA.id,
        scope: 'ORDER_SEQ',
        scopeId: custA3.id,
        lastSeq: 1,
      },
    ],
  });

  console.log('[seed-audit] Menyiapkan dua order lengkap per usaha (COMPLETED & AWAITING_DP)...');
  // Order 1: Usaha A, COMPLETED
  const orderA1 = await prisma.order.create({
    data: {
      id: 'ord_a1_completed',
      businessId: businessA.id,
      customerId: custA1.id,
      salesId: salesA1.id,
      customerSeq: 1,
      orderDate: new Date(),
      status: OrderStatus.COMPLETED,
      subtotal: 1000000n,
      discountTotal: 0n,
      shippingCharge: 50000n,
      ppnAmount: 115500n,
      grandTotal: 1165500n,
      dpAmount: 582750n,
      paidTotal: 1165500n,
      stockReserved: false,
      items: {
        create: {
          businessId: businessA.id,
          productId: prodA1.id,
          productName: prodA1.name,
          sku: prodA1.sku,
          unit: prodA1.unit,
          qty: 10,
          listPrice: prodA1.basePrice,
          unitPrice: 100000n,
          discountType: DiscountType.NONE,
          discountValue: 0n,
          discountSource: DiscountSource.MANUAL,
          lineSubtotal: 1000000n,
          lineDiscount: 0n,
          lineNet: 1000000n,
          costPrice: 70000n,
          floorPrice: 85000n,
          belowMin: false,
          sortOrder: 0,
        },
      },
    },
  });

  const invA1Dp = await prisma.invoice.create({
    data: {
      id: 'inv_a1_dp',
      orderId: orderA1.id,
      businessId: businessA.id,
      customerId: custA1.id,
      number: 'ALPHACUST1/INV/10/11/2026/0001-DP',
      type: InvoiceType.DP,
      status: InvoiceStatus.APPROVED,
      amount: 582750n,
      paidAmount: 582750n,
      requestedById: salesA1.id,
      approvedById: superAdmin.id,
      approvedAt: new Date(),
      issueDate: new Date(),
      printedCount: 1,
      snapshot: {
        schemaVersion: 1,
        invoiceNumber: 'ALPHACUST1/INV/10/11/2026/0001-DP',
        customer: { name: custA1.name, code: custA1.code },
        lines: [{ name: prodA1.name, qty: 10, unitPrice: 100000 }],
      },
    },
  });

  const invA1Final = await prisma.invoice.create({
    data: {
      id: 'inv_a1_final',
      orderId: orderA1.id,
      businessId: businessA.id,
      customerId: custA1.id,
      number: 'ALPHACUST1/INV/10/11/2026/0001-FINAL',
      type: InvoiceType.FINAL,
      status: InvoiceStatus.APPROVED,
      amount: 582750n,
      paidAmount: 582750n,
      requestedById: salesA1.id,
      approvedById: superAdmin.id,
      approvedAt: new Date(),
      issueDate: new Date(),
      printedCount: 1,
      snapshot: {
        schemaVersion: 1,
        invoiceNumber: 'ALPHACUST1/INV/10/11/2026/0001-FINAL',
        customer: { name: custA1.name, code: custA1.code },
        lines: [{ name: prodA1.name, qty: 10, unitPrice: 100000 }],
      },
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        id: 'pay_a1_dp',
        orderId: orderA1.id,
        businessId: businessA.id,
        invoiceId: invA1Dp.id,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: 582750n,
        paidAt: new Date(),
        createdById: salesA1.id,
        verifiedById: superAdmin.id,
        verifiedAt: new Date(),
      },
      {
        id: 'pay_a1_final',
        orderId: orderA1.id,
        businessId: businessA.id,
        invoiceId: invA1Final.id,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: 582750n,
        paidAt: new Date(),
        createdById: salesA1.id,
        verifiedById: superAdmin.id,
        verifiedAt: new Date(),
      },
    ],
  });

  await prisma.shipment.create({
    data: {
      id: 'shp_a1',
      orderId: orderA1.id,
      businessId: businessA.id,
      deliveryNo: 'DO/AAA/202611/0001',
      method: ShipMethod.OWN_FLEET,
      status: ShipStatus.DELIVERED,
      shippedAt: new Date(),
      deliveredAt: new Date(),
    },
  });

  // Order 2: Usaha A, AWAITING_DP
  const orderA2 = await prisma.order.create({
    data: {
      id: 'ord_a2_awaiting_dp',
      businessId: businessA.id,
      customerId: custA3.id,
      salesId: salesA1.id,
      customerSeq: 1,
      orderDate: new Date(),
      status: OrderStatus.AWAITING_DP,
      subtotal: 500000n,
      discountTotal: 0n,
      shippingCharge: 20000n,
      ppnAmount: 57200n,
      grandTotal: 577200n,
      dpAmount: 288600n,
      paidTotal: 0n,
      stockReserved: true,
      items: {
        create: {
          businessId: businessA.id,
          productId: prodA1.id,
          productName: prodA1.name,
          sku: prodA1.sku,
          unit: prodA1.unit,
          qty: 5,
          listPrice: prodA1.basePrice,
          unitPrice: 100000n,
          discountType: DiscountType.NONE,
          discountValue: 0n,
          discountSource: DiscountSource.MANUAL,
          lineSubtotal: 500000n,
          lineDiscount: 0n,
          lineNet: 500000n,
          costPrice: 70000n,
          floorPrice: 85000n,
          belowMin: false,
          sortOrder: 0,
        },
      },
    },
  });

  await prisma.invoice.create({
    data: {
      id: 'inv_a2_dp',
      orderId: orderA2.id,
      businessId: businessA.id,
      customerId: custA3.id,
      number: 'ALPHACUST3/INV/10/11/2026/0001-DP',
      type: InvoiceType.DP,
      status: InvoiceStatus.APPROVED,
      amount: 288600n,
      paidAmount: 0n,
      requestedById: salesA1.id,
      approvedById: superAdmin.id,
      approvedAt: new Date(),
      issueDate: new Date(),
      printedCount: 0,
      snapshot: {
        schemaVersion: 1,
        invoiceNumber: 'ALPHACUST3/INV/10/11/2026/0001-DP',
        customer: { name: custA3.name, code: custA3.code },
        lines: [{ name: prodA1.name, qty: 5, unitPrice: 100000 }],
      },
    },
  });

  console.log('[seed-audit] Selesai menyiapkan data seed audit.');
  return {
    businesses: { businessA, businessB },
    users: { superAdmin, salesA1, salesA2, salesB1, salesB2 },
    products: { prodA1, prodA2, prodA3, prodA4, prodA5, prodB1, prodB2 },
    customers: { custA1, custA2, custA3, custB1 },
    catalogs: { catA1, catA2, catB1 },
    orders: { orderA1, orderA2 },
  };
}

if (require.main === module) {
  seedAudit()
    .then(() => {
      console.log('Seed audit berhasil.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed audit gagal:', err);
      process.exit(1);
    });
}
