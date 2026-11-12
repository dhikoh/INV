import { test, expect } from '@playwright/test';
import {
  Role,
  OrderStatus,
  InvoiceType,
  InvoiceStatus,
  ShipMethod,
  ShipStatus,
  ReminderStatus,
  ReminderSource,
} from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { hashPassword } from '../../src/lib/auth/password';

test.use({
  channel: 'chrome',
});

test.describe.configure({ mode: 'serial' });

const PREFIX = 'p5_e2e_';
const IDS = {
  adminUser: `${PREFIX}admin_usr`,
  adminUsername: `${PREFIX}admin_tester`,
  salesUser: `${PREFIX}sales_usr`,
  salesUsername: `${PREFIX}sales_tester`,
  password: 'TestPhase5Password#2026',
  customer: `${PREFIX}cust_01`,
  product: `${PREFIX}prod_01`,
  histOrder: `${PREFIX}ord_hist`,
  dpOrder: `${PREFIX}ord_dp`,
  finOrder: `${PREFIX}ord_fin`,
  dpInvoice: `${PREFIX}inv_dp`,
  finInvoice: `${PREFIX}inv_fin`,
  finVerifyToken: `${PREFIX}verify_fin_tok`,
  shipment: `${PREFIX}ship_fin`,
  crmTask: `${PREFIX}task_01`,
  reminder: `${PREFIX}rem_01`,
};

let businessId = '';
let originalFlags = {
  allowSalesCashPayment: false,
  requireTransferProofForSales: true,
};

async function cleanupFixture(bizId: string) {
  const orderIds = [IDS.histOrder, IDS.dpOrder, IDS.finOrder];
  const userIds = [IDS.adminUser, IDS.salesUser];

  await prisma.notification.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.customerCreditEntry.deleteMany({
    where: { businessId: bizId, customerId: IDS.customer },
  });
  await prisma.paymentAllocation.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await prisma.payment.deleteMany({
    where: { businessId: bizId, orderId: { in: orderIds } },
  });
  await prisma.paymentBatch.deleteMany({
    where: { businessId: bizId, customerId: IDS.customer },
  });
  await prisma.shipmentItem.deleteMany({
    where: { shipment: { businessId: bizId, orderId: { in: orderIds } } },
  });
  await prisma.shipment.deleteMany({
    where: { businessId: bizId, orderId: { in: orderIds } },
  });
  await prisma.invoice.deleteMany({
    where: { businessId: bizId, orderId: { in: orderIds } },
  });
  await prisma.orderItem.deleteMany({
    where: { businessId: bizId, orderId: { in: orderIds } },
  });
  await prisma.order.deleteMany({
    where: { businessId: bizId, id: { in: orderIds } },
  });
  await prisma.reminder.deleteMany({
    where: { businessId: bizId, customerId: IDS.customer },
  });
  await prisma.crmTask.deleteMany({
    where: { businessId: bizId, customerId: IDS.customer },
  });
  await prisma.customer.deleteMany({
    where: { businessId: bizId, id: IDS.customer },
  });
  await prisma.product.deleteMany({
    where: { businessId: bizId, id: IDS.product },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
}

test.describe('Fase 5 E2E UI Tests — Riwayat Harga Transaksi, Pembayaran Kolektif + Kredit, & WhatsApp Pre-Filled (Desktop & Mobile)', () => {
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
        (r) =>
          r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST',
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
      allowSalesCashPayment: biz.allowSalesCashPayment,
      requireTransferProofForSales: biz.requireTransferProofForSales,
    };

    await cleanupFixture(businessId);

    const [adminHash, salesHash] = await Promise.all([
      hashPassword(IDS.password, IDS.adminUsername),
      hashPassword(IDS.password, IDS.salesUsername),
    ]);

    const adminUser = await prisma.user.create({
      data: {
        id: IDS.adminUser,
        username: IDS.adminUsername,
        passwordHash: adminHash,
        name: 'Admin Fase 5 E2E',
        role: Role.SUPERADMIN,
        businessId,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const salesUser = await prisma.user.create({
      data: {
        id: IDS.salesUser,
        username: IDS.salesUsername,
        passwordHash: salesHash,
        name: 'Sales Fase 5 E2E',
        role: Role.SALES,
        businessId,
        isActive: true,
        mustChangePassword: false,
      },
    });

    await prisma.customer.create({
      data: {
        id: IDS.customer,
        businessId,
        code: 'P5E2ECUST',
        name: 'PT Petshop Kolektif E2E',
        contactName: 'Siti',
        phone: '081288899900',
        address: 'Jl. Harmoni Fase 5 No. 12, Jakarta',
        assignedSalesId: salesUser.id,
      },
    });

    const product = await prisma.product.create({
      data: {
        id: IDS.product,
        businessId,
        sku: 'P5-E2E-SKU',
        name: 'BentoCat Salmon Fase 5 10kg',
        unit: 'Zak',
        costPrice: BigInt(60_000),
        basePrice: BigInt(100_000),
        minPrice: BigInt(85_000),
        stockQty: 50,
        reservedQty: 0,
        isActive: true,
      },
    });

    // 1. Order COMPLETED terdahulu untuk Riwayat Harga Transaksi
    await prisma.order.create({
      data: {
        id: IDS.histOrder,
        businessId,
        customerId: IDS.customer,
        salesId: salesUser.id,
        orderNo: 'SO-P5-HIST-01',
        orderDate: new Date('2026-10-20T09:00:00Z'),
        status: OrderStatus.COMPLETED,
        subtotal: BigInt(460_000),
        grandTotal: BigInt(460_000),
        paidTotal: BigInt(460_000),
        deliveryAddress: 'Jl. Harmoni Fase 5 No. 12, Jakarta',
        items: {
          create: {
            id: `${IDS.histOrder}_item`,
            businessId,
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            unit: product.unit,
            qty: 5,
            listPrice: BigInt(100_000),
            unitPrice: BigInt(92_000),
            lineSubtotal: BigInt(460_000),
            lineDiscount: BigInt(0),
            lineNet: BigInt(460_000),
            costPrice: BigInt(60_000),
            floorPrice: BigInt(85_000),
            belowMin: false,
            sortOrder: 0,
          },
        },
      },
    });

    // 2. Order DP yang menunggu DP
    await prisma.order.create({
      data: {
        id: IDS.dpOrder,
        businessId,
        customerId: IDS.customer,
        salesId: salesUser.id,
        orderNo: 'SO-P5-DP-01',
        orderDate: new Date('2026-11-10T09:00:00Z'),
        status: OrderStatus.AWAITING_DP,
        subtotal: BigInt(600_000),
        grandTotal: BigInt(600_000),
        dpAmount: BigInt(200_000),
        paidTotal: BigInt(0),
        deliveryAddress: 'Jl. Harmoni Fase 5 No. 12, Jakarta',
        items: {
          create: {
            id: `${IDS.dpOrder}_item`,
            businessId,
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            unit: product.unit,
            qty: 6,
            listPrice: BigInt(100_000),
            unitPrice: BigInt(100_000),
            lineSubtotal: BigInt(600_000),
            lineDiscount: BigInt(0),
            lineNet: BigInt(600_000),
            costPrice: BigInt(60_000),
            floorPrice: BigInt(85_000),
            belowMin: false,
            sortOrder: 0,
          },
        },
      },
    });

    await prisma.invoice.create({
      data: {
        id: IDS.dpInvoice,
        businessId,
        orderId: IDS.dpOrder,
        customerId: IDS.customer,
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'DP-P5-E2E-01',
        amount: BigInt(200_000),
        paidAmount: BigInt(0),
        issueDate: new Date('2026-11-10T10:00:00Z'),
        dueDate: new Date('2026-11-20T10:00:00Z'),
        requestedById: salesUser.id,
        approvedById: adminUser.id,
        approvedAt: new Date('2026-11-10T10:00:00Z'),
      },
    });

    // 3. Order FINAL yang siap lunas & sudah terkirim
    await prisma.order.create({
      data: {
        id: IDS.finOrder,
        businessId,
        customerId: IDS.customer,
        salesId: salesUser.id,
        orderNo: 'SO-P5-FIN-02',
        orderDate: new Date('2026-11-11T09:00:00Z'),
        status: OrderStatus.AWAITING_FINAL_PAYMENT,
        subtotal: BigInt(400_000),
        grandTotal: BigInt(400_000),
        paidTotal: BigInt(0),
        deliveryAddress: 'Jl. Harmoni Fase 5 No. 12, Jakarta',
        items: {
          create: {
            id: `${IDS.finOrder}_item`,
            businessId,
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            unit: product.unit,
            qty: 4,
            listPrice: BigInt(100_000),
            unitPrice: BigInt(100_000),
            lineSubtotal: BigInt(400_000),
            lineDiscount: BigInt(0),
            lineNet: BigInt(400_000),
            costPrice: BigInt(60_000),
            floorPrice: BigInt(85_000),
            belowMin: false,
            sortOrder: 0,
          },
        },
      },
    });

    await prisma.invoice.create({
      data: {
        id: IDS.finInvoice,
        businessId,
        orderId: IDS.finOrder,
        customerId: IDS.customer,
        type: InvoiceType.FINAL,
        status: InvoiceStatus.APPROVED,
        number: 'INV-P5-E2E-02',
        amount: BigInt(400_000),
        paidAmount: BigInt(0),
        verifyToken: IDS.finVerifyToken,
        issueDate: new Date('2026-11-11T10:00:00Z'),
        dueDate: new Date('2026-11-25T10:00:00Z'),
        requestedById: salesUser.id,
        approvedById: adminUser.id,
        approvedAt: new Date('2026-11-11T10:00:00Z'),
      },
    });

    await prisma.shipment.create({
      data: {
        id: IDS.shipment,
        businessId,
        orderId: IDS.finOrder,
        kloterNo: 1,
        deliveryNo: 'SJ-P5-E2E-01',
        method: ShipMethod.OWN_FLEET,
        status: ShipStatus.DELIVERED,
        shippedAt: new Date('2026-11-11T11:00:00Z'),
        deliveredAt: new Date('2026-11-11T14:00:00Z'),
        items: {
          create: {
            id: `${IDS.shipment}_item`,
            orderItemId: `${IDS.finOrder}_item`,
            qty: 4,
          },
        },
      },
    });

    // 4. Reminder & CRM Task untuk verifikasi WhatsApp pre-filled pada Dashboard Sales
    await prisma.reminder.create({
      data: {
        id: IDS.reminder,
        businessId,
        customerId: IDS.customer,
        salesId: salesUser.id,
        intervalDays: 14,
        lastOrderDate: new Date('2026-10-20T09:00:00Z'),
        nextDueDate: new Date(),
        status: ReminderStatus.ACTIVE,
        source: ReminderSource.MANUAL,
      },
    });

    await prisma.crmTask.create({
      data: {
        id: IDS.crmTask,
        businessId,
        customerId: IDS.customer,
        assignedToId: salesUser.id,
        title: 'Konfirmasi Repeat Order Fase 5',
        dueAt: new Date(),
      },
    });
  });

  test.afterAll(async () => {
    if (businessId) {
      await prisma.business.update({
        where: { id: businessId },
        data: originalFlags,
      });
      await cleanupFixture(businessId);
    }
  });

  test('Desktop 1280px: Sales melihat riwayat harga bebas HPP, link WA pre-filled, mengajukan Pembayaran Kolektif + kelebihan kredit, dan Super Admin Verifikasi 1-klik', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Sales login -> Dashboard WA links
    await loginViaUi(page, IDS.salesUsername, IDS.password);
    const waLinks = page.locator('a[href^="https://wa.me/6281288899900?text="]');
    await expect(waLinks.first()).toBeVisible({ timeout: 20_000 });

    // 2. Halaman Detail Invoice -> tombol Kirim via WhatsApp pre-filled
    await page.goto(`/invoices/${IDS.finInvoice}`, { waitUntil: 'networkidle' });
    const invWaBtn = page.getByRole('link', { name: 'Kirim via WhatsApp' });
    await expect(invWaBtn).toBeVisible({ timeout: 20_000 });
    const invHref = await invWaBtn.getAttribute('href');
    expect(invHref).toContain('https://wa.me/6281288899900?text=');
    expect(decodeURIComponent(invHref || '')).toContain('INV-P5-E2E-02');
    expect(decodeURIComponent(invHref || '')).toContain(IDS.finVerifyToken);

    // 3. Halaman Detail Customer Tab Harga & Promo -> Riwayat Harga Transaksi Pelanggan (bebas HPP)
    await page.goto(`/customers/${IDS.customer}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Harga & Promo/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Riwayat Harga Transaksi Pelanggan' })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('SO-P5-HIST-01')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Rp 92.000').first()).toBeVisible({ timeout: 15_000 });

    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toMatch(/costPrice|Harga Modal|\bHPP\b|Margin Laba/i);

    // 4. Tab Order -> + Catat Pembayaran Kolektif
    await page.getByRole('button', { name: /^Order/i }).click();
    await page.getByRole('button', { name: '+ Catat Pembayaran Kolektif' }).click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Catat Pembayaran Kolektif (Multi-Faktur)' })
    ).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('DP-P5-E2E-01')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('INV-P5-E2E-02')).toBeVisible({ timeout: 15_000 });

    // Centang kedua faktur (DP 200.000 + FINAL 400.000 = 600.000)
    await dialog.getByLabel('Pilih faktur DP-P5-E2E-01').check();
    await dialog.getByLabel('Pilih faktur INV-P5-E2E-02').check();
    await expect(dialog.getByText(/Rp\s*600\.000/).first()).toBeVisible({ timeout: 10_000 });

    // Isi Total Transfer Rp 650.000 -> Kelebihan Rp 50.000 ke Saldo Kredit
    await dialog.getByPlaceholder('Contoh: 500000').fill('650000');
    await expect(
      dialog.getByText(/Kelebihan Pembayaran Terdeteksi:\s*Rp\s*50\.000/i)
    ).toBeVisible({ timeout: 10_000 });

    // Unggah file bukti transfer
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'bukti-kolektif.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      ),
    });

    const [collectiveRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/payments/collective') &&
          r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      dialog.getByRole('button', { name: 'Kirim Pembayaran Kolektif' }).click(),
    ]);
    expect(collectiveRes.status()).toBe(201);
    const collectiveJson = await collectiveRes.json();
    expect(collectiveJson.data.creditOption).toBe(true);
    expect(collectiveJson.data.creditAmount).toBe(50_000);
    await expect(
      page.getByText(/Pembayaran kolektif berhasil/i)
    ).toBeVisible({ timeout: 15_000 });

    // 5. Super Admin login -> /payments -> Verifikasi 1-klik
    await loginViaUi(page, IDS.adminUsername, IDS.password);
    await page.goto('/payments', { waitUntil: 'networkidle' });

    await expect(page.getByText('Kolektif (2 Faktur)')).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Kelebihan ke Saldo Kredit:\s*Rp\s*50\.000/i)
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'DP-P5-E2E-01' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'INV-P5-E2E-02' })).toBeVisible();

    const batchCard = page
      .locator('div')
      .filter({ hasText: 'Kolektif (2 Faktur)' })
      .filter({ has: page.getByRole('button', { name: 'Verifikasi' }) })
      .last();
    await batchCard.getByRole('button', { name: 'Verifikasi' }).click();

    await expect(
      page.getByText(/pembayaran kolektif sebesar\s*Rp\s*650\.000/i)
    ).toBeVisible({ timeout: 10_000 });

    const [verifyRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/payments/') &&
          r.url().includes('/verify') &&
          r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.getByRole('button', { name: 'Ya, Verifikasi Pembayaran' }).click(),
    ]);
    expect(verifyRes.status()).toBe(200);

    // Verifikasi hasil di Database + API credit-balance
    const [ordDp, ordFin, creditRes] = await Promise.all([
      prisma.order.findFirstOrThrow({ where: { id: IDS.dpOrder, businessId } }),
      prisma.order.findFirstOrThrow({ where: { id: IDS.finOrder, businessId } }),
      page.request.get(`/api/v1/customers/${IDS.customer}/credit-balance`),
    ]);

    expect(Number(ordDp.paidTotal)).toBe(200_000);
    expect(ordDp.status).toBe(OrderStatus.IN_PROCESS);
    expect(Number(ordFin.paidTotal)).toBe(400_000);
    expect(ordFin.status).toBe(OrderStatus.COMPLETED);

    expect(creditRes.status()).toBe(200);
    const creditJson = await creditRes.json();
    expect(creditJson.data.balance).toBe(50_000);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('Mobile 360px: Halaman Pelanggan (Riwayat Harga + Pembayaran Kolektif) & Faktur WhatsApp bebas horizontal overflow', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 800 });

    await loginViaUi(page, IDS.salesUsername, IDS.password);

    await page.goto(`/customers/${IDS.customer}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Harga & Promo/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Riwayat Harga Transaksi Pelanggan' })
    ).toBeVisible({ timeout: 20_000 });
    const custOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(custOverflow).toBeLessThanOrEqual(2);

    await page.goto(`/invoices/${IDS.finInvoice}`, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('link', { name: 'Kirim via WhatsApp' })
    ).toBeVisible({ timeout: 20_000 });
    const invOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(invOverflow).toBeLessThanOrEqual(2);
  });
});
