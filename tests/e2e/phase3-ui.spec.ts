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

const PREFIX = 'p3_e2e_';
const IDS = {
  salesUser: `${PREFIX}sales_usr`,
  salesUsername: `${PREFIX}sales_tester`,
  adminUser: `${PREFIX}admin_usr`,
  adminUsername: `${PREFIX}admin_tester`,
  password: 'TestPhase3Password#2026',
  customer: `${PREFIX}cust_01`,
  product: `${PREFIX}prod_01`,
  order: `${PREFIX}ord_01`,
  dpInvoice: `${PREFIX}inv_dp_01`,
  payment: `${PREFIX}pay_dp_01`,
};

let businessId = '';

async function cleanupFixture(bizId: string) {
  await prisma.notification.deleteMany({
    where: { userId: { in: [IDS.salesUser, IDS.adminUser] } },
  });
  await prisma.orderRevision.deleteMany({
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
    where: { userId: { in: [IDS.salesUser, IDS.adminUser] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [IDS.salesUser, IDS.adminUser] } },
  });
}

test.describe('Fase 3 E2E UI Tests — Revisi Pesanan IN_PROCESS (Desktop & Mobile)', () => {
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
    await cleanupFixture(businessId);

    const salesHash = await hashPassword(IDS.password, IDS.salesUsername);
    const adminHash = await hashPassword(IDS.password, IDS.adminUsername);

    const salesUser = await prisma.user.create({
      data: {
        id: IDS.salesUser,
        username: IDS.salesUsername,
        passwordHash: salesHash,
        name: 'Sales Fase 3 E2E',
        role: Role.SALES,
        businessId,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const adminUser = await prisma.user.create({
      data: {
        id: IDS.adminUser,
        username: IDS.adminUsername,
        passwordHash: adminHash,
        name: 'Admin Fase 3 E2E',
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
        code: 'P3E2ECUST',
        name: 'PT Petshop Revisi E2E',
        contactName: 'Dimas',
        phone: '081299988877',
        address: 'Jl. Uji Fase 3 No. 25, Jakarta',
        assignedSalesId: salesUser.id,
      },
    });

    const product = await prisma.product.create({
      data: {
        id: IDS.product,
        businessId,
        sku: 'P3-E2E-SKU',
        name: 'Kibble Premium Fase 3 10kg',
        unit: 'Zak',
        costPrice: BigInt(60_000),
        basePrice: BigInt(100_000),
        minPrice: BigInt(85_000),
        stockQty: 50,
        reservedQty: 5,
        isActive: true,
      },
    });

    await prisma.order.create({
      data: {
        id: IDS.order,
        businessId,
        orderNo: 'BC/SO/12/11/2026/9031',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        customerId: IDS.customer,
        salesId: salesUser.id,
        status: OrderStatus.IN_PROCESS,
        subtotal: BigInt(500_000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(500_000),
        dpBps: 3000,
        dpAmount: BigInt(150_000),
        paidTotal: BigInt(150_000),
        creditTotal: BigInt(0),
        stockReserved: true,
        deliveryAddress: 'Jl. Uji Fase 3 No. 25, Jakarta',
        version: 1,
        rev: 2,
        verifyToken: 'ver_p3_e2e_order_01',
        items: {
          create: [
            {
              businessId,
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              unit: product.unit,
              qty: 5,
              listPrice: product.basePrice,
              unitPrice: BigInt(100_000),
              lineSubtotal: BigInt(500_000),
              lineDiscount: BigInt(0),
              lineNet: BigInt(500_000),
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
        number: 'BC/INV-DP/12/11/2026/9031',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        version: 1,
        amount: BigInt(150_000),
        paidAmount: BigInt(150_000),
        issueDate: new Date('2026-11-12T00:00:00Z'),
        dueDate: new Date('2026-11-19T00:00:00Z'),
        verifyToken: 'ver_p3_e2e_dp_01',
        requestedById: salesUser.id,
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
        status: PaymentStatus.VERIFIED,
        amount: BigInt(150_000),
        paidAt: new Date(),
        reference: 'BCA-P3-E2E',
        createdById: salesUser.id,
        verifiedById: adminUser.id,
        verifiedAt: new Date(),
        receiptNo: 'KWT-P3E2E-001',
        verifyToken: 'ver_p3_e2e_pay_01',
      },
    });
  });

  test.afterAll(async () => {
    if (businessId) {
      await cleanupFixture(businessId);
    }
    await prisma.$disconnect();
  });

  test('Desktop (1280px): Sales ajukan revisi item -> Super Admin setujui -> total & sisa pelunasan diperbarui', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // 1. Sales mengajukan revisi qty 5 -> 8 di Desktop 1280x800
    const salesContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const salesPage = await salesContext.newPage();

    await loginViaUi(salesPage, IDS.salesUsername, IDS.password);
    await salesPage.goto(`/orders/${IDS.order}`, { waitUntil: 'domcontentloaded' });

    await expect(salesPage.getByRole('link', { name: /Ajukan Revisi Item/i })).toBeVisible({
      timeout: 20_000,
    });
    const hasOverflowDetail = await salesPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasOverflowDetail).toBe(false);

    await salesPage.getByRole('link', { name: /Ajukan Revisi Item/i }).click();
    await salesPage.waitForURL(`**/orders/${IDS.order}/revise`, { timeout: 20_000 });

    await expect(salesPage.getByText('Alasan Revisi Pesanan *')).toBeVisible({ timeout: 20_000 });
    const qtyInput = salesPage.locator('input[type="number"][max="1000000"]').first();
    await qtyInput.fill('8');
    await salesPage
      .locator('textarea[placeholder*="Jelaskan perubahan"]')
      .fill('Customer minta tambahan 3 zak untuk cabang baru');

    await expect(salesPage.getByText('Total Sebelum Revisi:')).toBeVisible();
    await expect(salesPage.getByText('+Rp 300.000')).toBeVisible();

    const hasOverflowRevise = await salesPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasOverflowRevise).toBe(false);

    await salesPage.getByRole('button', { name: /Ajukan Revisi Pesanan/i }).click();
    await expect(salesPage.getByText('Konfirmasi Simpan Pesanan')).toBeVisible();

    const [postRevRes] = await Promise.all([
      salesPage.waitForResponse(
        (r) => r.url().includes(`/api/v1/orders/${IDS.order}/revisions`) && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      salesPage.getByRole('button', { name: /Ya, Simpan Pesanan/i }).click(),
    ]);
    expect(postRevRes.status()).toBe(201);
    await salesPage.waitForURL(`**/orders/${IDS.order}`, { timeout: 20_000 });

    await expect(salesPage.getByText('Riwayat Revisi Pesanan (1)')).toBeVisible({ timeout: 20_000 });
    await expect(salesPage.getByText('Customer minta tambahan 3 zak untuk cabang baru')).toBeVisible();
    await salesContext.close();

    // 2. Super Admin tinjau di /approvals lalu setujui revisi di /orders/[id]
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();

    await loginViaUi(adminPage, IDS.adminUsername, IDS.password);
    await adminPage.goto('/approvals', { waitUntil: 'domcontentloaded' });

    await expect(adminPage.getByText(/Pengajuan Revisi Pesanan/i)).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText('PT Petshop Revisi E2E (P3E2ECUST)')).toBeVisible();
    const hasOverflowApprovals = await adminPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasOverflowApprovals).toBe(false);

    await adminPage.locator(`a[href="/orders/${IDS.order}"]`).first().click();
    await adminPage.waitForURL(`**/orders/${IDS.order}`, { timeout: 20_000 });

    await expect(adminPage.getByRole('button', { name: /Setujui Revisi/i })).toBeVisible({
      timeout: 20_000,
    });
    const [approveRes] = await Promise.all([
      adminPage.waitForResponse(
        (r) => r.url().includes('/api/v1/order-revisions/') && r.url().includes('/approve'),
        { timeout: 30_000 }
      ),
      adminPage.getByRole('button', { name: /Setujui Revisi/i }).click(),
    ]);
    expect(approveRes.status()).toBe(200);

    // Nilai order diperbarui menjadi 8 x 100.000 = Rp 800.000
    await expect(adminPage.getByText('8 Zak').first()).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText(/Rp\s*800\.000/).first()).toBeVisible();
    await adminContext.close();

    // 3. Verifikasi stok ter-reservasi di DB bertambah dari 5 -> 8 dan Mobile 360px bersih
    const prodAfter = await prisma.product.findFirstOrThrow({
      where: { id: IDS.product, businessId },
    });
    expect(prodAfter.reservedQty).toBe(8);
  });

  test('Mobile (360px): Halaman detail pesanan pasca-revisi & modal pelunasan tampil responsif tanpa overflow', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const mobileContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const mobilePage = await mobileContext.newPage();

    await loginViaUi(mobilePage, IDS.salesUsername, IDS.password);
    await mobilePage.goto(`/orders/${IDS.order}`, { waitUntil: 'domcontentloaded' });

    await expect(mobilePage.getByText('Riwayat Revisi Pesanan (1)')).toBeVisible({
      timeout: 20_000,
    });
    await expect(mobilePage.getByText('Revisi #1')).toBeVisible();

    // Buka modal Ajukan Pelunasan — harus menampilkan sisa Rp 650.000 (800.000 - 150.000 DP)
    const ajukanPelunasanBtn = mobilePage.getByRole('button', { name: /Ajukan Pelunasan/i });
    await expect(ajukanPelunasanBtn).toBeVisible();
    await ajukanPelunasanBtn.click();
    await expect(mobilePage.getByText(/Rp\s*650\.000/).first()).toBeVisible();

    const hasMobileOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasMobileOverflow).toBe(false);

    await mobileContext.close();
  });
});
