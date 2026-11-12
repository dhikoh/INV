import { test, expect } from '@playwright/test';
import {
  Role,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { hashPassword } from '../../src/lib/auth/password';

test.use({
  channel: 'chrome',
});

const PREFIX = 'p4_e2e_';
const IDS = {
  adminUser: `${PREFIX}admin_usr`,
  adminUsername: `${PREFIX}admin_tester`,
  password: 'TestPhase4Password#2026',
  customer: `${PREFIX}cust_01`,
  product: `${PREFIX}prod_01`,
  order: `${PREFIX}ord_01`,
  dpInvoice: `${PREFIX}inv_dp_01`,
  payment: `${PREFIX}pay_dp_01`,
};

let businessId = '';
let originalFlags = {
  allowPartialShipment: false,
  allowShipBeforeFinalInvoice: false,
  requirePaidBeforeShip: false,
};

async function cleanupFixture(bizId: string) {
  await prisma.notification.deleteMany({
    where: { userId: { in: [IDS.adminUser] } },
  });
  await prisma.shipmentItem.deleteMany({
    where: { shipment: { businessId: bizId, orderId: IDS.order } },
  });
  await prisma.shipment.deleteMany({
    where: { businessId: bizId, orderId: IDS.order },
  });
  await prisma.payment.deleteMany({
    where: { businessId: bizId, orderId: IDS.order },
  });
  await prisma.invoice.deleteMany({
    where: { businessId: bizId, orderId: IDS.order },
  });
  await prisma.orderItem.deleteMany({
    where: { businessId: bizId, orderId: IDS.order },
  });
  await prisma.order.deleteMany({
    where: { businessId: bizId, id: IDS.order },
  });
  await prisma.customer.deleteMany({
    where: { businessId: bizId, id: IDS.customer },
  });
  await prisma.product.deleteMany({
    where: { businessId: bizId, id: IDS.product },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: [IDS.adminUser] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [IDS.adminUser] } },
  });
}

test.describe('Fase 4 E2E UI Tests — Toggle Kebijakan & Pengiriman Parsial Multi-Kloter (Desktop & Mobile)', () => {
  async function loginViaUi(
    page: import('@playwright/test').Page,
    username: string,
    password: string
  ) {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.fill('input#username', username);
    await page.fill('input[type="password"]', password);
    const [loginRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.click('button[type="submit"]'),
    ]);
    expect(loginRes.status()).toBe(200);
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
  }

  test.beforeAll(async () => {
    const biz = await prisma.business.findFirstOrThrow({
      where: { isActive: true },
    });
    businessId = biz.id;
    originalFlags = {
      allowPartialShipment: biz.allowPartialShipment,
      allowShipBeforeFinalInvoice: biz.allowShipBeforeFinalInvoice,
      requirePaidBeforeShip: biz.requirePaidBeforeShip,
    };

    await prisma.business.update({
      where: { id: businessId },
      data: {
        allowPartialShipment: false,
        allowShipBeforeFinalInvoice: false,
        requirePaidBeforeShip: false,
      },
    });

    await cleanupFixture(businessId);

    const adminHash = await hashPassword(IDS.password, IDS.adminUsername);
    const adminUser = await prisma.user.create({
      data: {
        id: IDS.adminUser,
        username: IDS.adminUsername,
        passwordHash: adminHash,
        name: 'Admin Fase 4 E2E',
        role: Role.SUPERADMIN,
        businessId,
        isActive: true,
        mustChangePassword: false,
      },
    });

    await prisma.customer.create({
      data: {
        id: IDS.customer,
        businessId,
        code: 'P4E2ECUST',
        name: 'PT Petshop Kloter E2E',
        contactName: 'Hendra',
        phone: '081277766655',
        address: 'Jl. Uji Fase 4 No. 88, Bandung',
        assignedSalesId: adminUser.id,
      },
    });

    const product = await prisma.product.create({
      data: {
        id: IDS.product,
        businessId,
        sku: 'P4-E2E-SKU',
        name: 'BentoCat Tuna Fase 4 10kg',
        unit: 'Zak',
        costPrice: BigInt(60_000),
        basePrice: BigInt(100_000),
        minPrice: BigInt(85_000),
        stockQty: 50,
        reservedQty: 10,
        isActive: true,
      },
    });

    await prisma.order.create({
      data: {
        id: IDS.order,
        businessId,
        orderNo: 'BC/SO/12/11/2026/9041',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        customerId: IDS.customer,
        salesId: adminUser.id,
        status: OrderStatus.IN_PROCESS,
        subtotal: BigInt(1_000_000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(1_000_000),
        dpBps: 3000,
        dpAmount: BigInt(300_000),
        paidTotal: BigInt(300_000),
        creditTotal: BigInt(0),
        stockReserved: true,
        deliveryAddress: 'Jl. Uji Fase 4 No. 88, Bandung',
        version: 1,
        rev: 2,
        verifyToken: 'ver_p4_e2e_order_01',
        items: {
          create: [
            {
              businessId,
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              unit: product.unit,
              qty: 10,
              listPrice: product.basePrice,
              unitPrice: BigInt(100_000),
              lineSubtotal: BigInt(1_000_000),
              lineDiscount: BigInt(0),
              lineNet: BigInt(1_000_000),
              costPrice: product.costPrice,
              floorPrice: product.minPrice,
              belowMin: false,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    await prisma.invoice.create({
      data: {
        id: IDS.dpInvoice,
        businessId,
        orderId: IDS.order,
        customerId: IDS.customer,
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'BC/INV-DP/12/11/2026/9041',
        version: 1,
        amount: BigInt(300_000),
        paidAmount: BigInt(300_000),
        issueDate: new Date('2026-11-12T00:00:00Z'),
        dueDate: new Date('2026-11-19T00:00:00Z'),
        verifyToken: 'ver_p4_e2e_dp_01',
        requestedById: adminUser.id,
        approvedById: adminUser.id,
        approvedAt: new Date(),
      },
    });

    await prisma.payment.create({
      data: {
        id: IDS.payment,
        businessId,
        orderId: IDS.order,
        invoiceId: IDS.dpInvoice,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        amount: BigInt(300_000),
        paidAt: new Date(),
        status: PaymentStatus.VERIFIED,
        createdById: adminUser.id,
        verifiedById: adminUser.id,
        verifiedAt: new Date(),
        receiptNo: 'KWT-P4E2E-001',
        verifyToken: 'ver_p4_e2e_pay_01',
      },
    });
  });

  test.afterAll(async () => {
    if (businessId) {
      await cleanupFixture(businessId);
      await prisma.business.update({
        where: { id: businessId },
        data: originalFlags,
      });
    }
    await prisma.$disconnect();
  });

  test('Desktop 1280px: Aktifkan toggle parsial di Pengaturan Bisnis lalu kirim 2 kloter (4 + 6) tanpa overflow', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginViaUi(page, IDS.adminUsername, IDS.password);

    // 1. Buka /settings/business dan aktifkan kedua toggle Fase 4
    await page.goto('/settings/business', { waitUntil: 'networkidle' });
    const partialToggle = page.getByLabel('Izinkan Pengiriman Parsial / Bertahap (Multi-Kloter)');
    const beforeFinalToggle = page.getByLabel(
      'Izinkan Pengiriman Barang Sebelum Faktur Pelunasan'
    );
    await expect(partialToggle).toBeVisible({ timeout: 20_000 });
    await partialToggle.check();
    await beforeFinalToggle.check();

    const [saveRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/businesses/') && r.request().method() === 'PATCH',
        { timeout: 30_000 }
      ),
      page.getByRole('button', { name: /Simpan Pengaturan/i }).click(),
    ]);
    expect(saveRes.status()).toBe(200);

    // 2. Buka detail order IN_PROCESS dan kirim Kloter #1 sebanyak 4 Zak
    await page.goto(`/orders/${IDS.order}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('0 / 10 unit terkirim')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Kirim Barang' }).first().click();
    const qtyInput1 = page.getByLabel('Qty dikirim BentoCat Tuna Fase 4 10kg');
    await expect(qtyInput1).toBeVisible({ timeout: 15_000 });
    await expect(qtyInput1).toBeEnabled();
    await qtyInput1.fill('4');

    const [ship1Res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/v1/orders/${IDS.order}/shipment/ship`) && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.getByRole('button', { name: 'Konfirmasi Kirim' }).click(),
    ]);
    expect(ship1Res.status()).toBe(200);

    await expect(page.getByText('Kloter #1')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('4 / 10 unit terkirim')).toBeVisible({ timeout: 15_000 });

    // 3. Kirim Kloter #2 sisa 6 Zak
    await page.getByRole('button', { name: 'Kirim Kloter Berikutnya' }).click();
    const qtyInput2 = page.getByLabel('Qty dikirim BentoCat Tuna Fase 4 10kg');
    await expect(qtyInput2).toHaveValue('6', { timeout: 15_000 });

    const [ship2Res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/v1/orders/${IDS.order}/shipment/ship`) && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.getByRole('button', { name: 'Konfirmasi Kirim' }).click(),
    ]);
    expect(ship2Res.status()).toBe(200);

    await expect(page.getByText('Kloter #2')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('10 / 10 unit terkirim')).toBeVisible({ timeout: 15_000 });

    // 4. Verifikasi stok fisik dan reservasi produk di database
    const updatedProduct = await prisma.product.findFirstOrThrow({
      where: { id: IDS.product, businessId },
    });
    expect(updatedProduct.stockQty).toBe(40);
    expect(updatedProduct.reservedQty).toBe(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('Mobile 360px: Halaman Pengaturan Bisnis & Kartu Multi-Kloter bebas horizontal overflow', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 800 });
    await loginViaUi(page, IDS.adminUsername, IDS.password);

    await page.goto('/settings/business', { waitUntil: 'networkidle' });
    await expect(
      page.getByText('Izinkan Pengiriman Parsial / Bertahap (Multi-Kloter)')
    ).toBeVisible({ timeout: 20_000 });
    const settingsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(settingsOverflow).toBeLessThanOrEqual(2);

    await page.goto(`/orders/${IDS.order}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Progres Pengiriman Item')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Kloter #1')).toBeVisible({ timeout: 15_000 });
    const orderOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(orderOverflow).toBeLessThanOrEqual(2);
  });
});
