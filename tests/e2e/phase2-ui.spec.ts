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

const PREFIX = 'p2_e2e_';
const IDS = {
  salesUser: `${PREFIX}sales_usr`,
  salesUsername: `${PREFIX}sales_tester`,
  salesPassword: 'TestSalesPassword2#2026',
  customer: `${PREFIX}cust_01`,
  product: `${PREFIX}prod_01`,
  proformaOrder: `${PREFIX}ord_proforma`,
  approvedOrder: `${PREFIX}ord_approved`,
  dpInvoiceApproved: `${PREFIX}inv_dp_approved`,
  dpInvoiceVoid: `${PREFIX}inv_dp_void`,
  paymentVerified: `${PREFIX}pay_dp_verified`,
  paymentPending: `${PREFIX}pay_dp_pending`,
  tokProforma: 'ver_p2_e2e_proforma_tok',
  tokInvApproved: 'ver_p2_e2e_inv_app_tok',
  tokInvVoid: 'ver_p2_e2e_inv_void_tok',
  tokPayVerified: 'ver_p2_e2e_pay_ver_tok',
  receiptNo: 'KWT-P2E2E-20261112-001',
};

let businessId = '';

async function cleanupFixture(bizId: string) {
  await prisma.notification.deleteMany({
    where: { userId: IDS.salesUser },
  });
  await prisma.payment.deleteMany({
    where: {
      businessId: bizId,
      orderId: { in: [IDS.proformaOrder, IDS.approvedOrder] },
    },
  });
  await prisma.invoice.deleteMany({
    where: {
      businessId: bizId,
      orderId: { in: [IDS.proformaOrder, IDS.approvedOrder] },
    },
  });
  await prisma.orderItem.deleteMany({
    where: {
      businessId: bizId,
      orderId: { in: [IDS.proformaOrder, IDS.approvedOrder] },
    },
  });
  await prisma.order.deleteMany({
    where: {
      businessId: bizId,
      id: { in: [IDS.proformaOrder, IDS.approvedOrder] },
    },
  });
  await prisma.customer.deleteMany({
    where: { businessId: bizId, id: IDS.customer },
  });
  await prisma.product.deleteMany({
    where: { businessId: bizId, id: IDS.product },
  });
  await prisma.session.deleteMany({ where: { userId: IDS.salesUser } });
  await prisma.user.deleteMany({ where: { id: IDS.salesUser } });
}

test.describe('Fase 2 E2E UI Tests — Public /verify/[token] & Cetak Kwitansi VERIFIED', () => {
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
        { timeout: 30000 }
      ),
      page.click('button[type="submit"]'),
    ]);
    expect(loginRes.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30000 });
  }

  test.beforeAll(async () => {
    const biz = await prisma.business.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    businessId = biz.id;

    await cleanupFixture(businessId);

    const passwordHash = await hashPassword(IDS.salesPassword, IDS.salesUsername);
    const salesUser = await prisma.user.create({
      data: {
        id: IDS.salesUser,
        username: IDS.salesUsername,
        passwordHash,
        name: 'Sales Uji Fase 2',
        role: Role.SALES,
        businessId,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const superAdmin = await prisma.user.findFirstOrThrow({
      where: { role: Role.SUPERADMIN, deletedAt: null },
    });

    await prisma.customer.create({
      data: {
        id: IDS.customer,
        businessId,
        code: 'P2E2E',
        name: 'PT Sumber Bahagia Lestari',
        contactName: 'Rina',
        phone: '081999888777',
        address: 'Jl. Kenanga Raya No. 88, Bandung',
        assignedSalesId: salesUser.id,
      },
    });

    const product = await prisma.product.create({
      data: {
        id: IDS.product,
        businessId,
        sku: `${PREFIX}SKU`,
        name: 'Makanan Kucing Fase 2 5kg',
        unit: 'sak',
        costPrice: BigInt(100000),
        basePrice: BigInt(180000),
        minPrice: BigInt(150000),
        stockQty: 100,
        reservedQty: 0,
      },
    });

    const baseLine = {
      businessId,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      qty: 10,
      listPrice: BigInt(180000),
      unitPrice: BigInt(180000),
      lineSubtotal: BigInt(1800000),
      lineDiscount: BigInt(0),
      lineNet: BigInt(1800000),
      costPrice: BigInt(100000),
      floorPrice: BigInt(150000),
      belowMin: false,
      sortOrder: 0,
    };

    // 1. Order Proforma (DRAFT)
    await prisma.order.create({
      data: {
        id: IDS.proformaOrder,
        businessId,
        orderNo: 'ORD-P2E2E-20261112-001',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        customerId: IDS.customer,
        salesId: salesUser.id,
        status: OrderStatus.DRAFT,
        deliveryAddress: 'Jl. Kenanga Raya No. 88, Bandung',
        subtotal: BigInt(1800000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(1800000),
        dpBps: 5000,
        dpAmount: BigInt(900000),
        verifyToken: IDS.tokProforma,
        items: { create: baseLine },
      },
    });

    // 2. Order aktif + Faktur Approved + Faktur Void + Pembayaran Verified & Pending
    await prisma.order.create({
      data: {
        id: IDS.approvedOrder,
        businessId,
        orderNo: 'ORD-P2E2E-20261112-002',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        customerId: IDS.customer,
        salesId: salesUser.id,
        status: OrderStatus.IN_PROCESS,
        deliveryAddress: 'Jl. Kenanga Raya No. 88, Bandung',
        subtotal: BigInt(3600000),
        discountTotal: BigInt(0),
        shippingCharge: BigInt(0),
        ppnEnabled: false,
        ppnRateBps: 0,
        ppnAmount: BigInt(0),
        grandTotal: BigInt(3600000),
        paidTotal: BigInt(1800000),
        dpBps: 5000,
        dpAmount: BigInt(1800000),
        stockReserved: true,
        verifyToken: 'ver_p2_e2e_ord_app_tok',
        items: { create: { ...baseLine, qty: 20, lineSubtotal: BigInt(3600000), lineNet: BigInt(3600000) } },
      },
    });

    await prisma.invoice.create({
      data: {
        id: IDS.dpInvoiceApproved,
        businessId,
        orderId: IDS.approvedOrder,
        customerId: IDS.customer,
        number: 'INV-P2E2E-20261112-001',
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        amount: BigInt(1800000),
        paidAmount: BigInt(1800000),
        issueDate: new Date('2026-11-12T00:00:00Z'),
        dueDate: new Date('2026-11-19T00:00:00Z'),
        requestedById: salesUser.id,
        approvedById: superAdmin.id,
        approvedAt: new Date('2026-11-12T00:00:00Z'),
        verifyToken: IDS.tokInvApproved,
      },
    });

    await prisma.invoice.create({
      data: {
        id: IDS.dpInvoiceVoid,
        businessId,
        orderId: IDS.approvedOrder,
        customerId: IDS.customer,
        number: 'INV-P2E2E-20261112-002',
        type: InvoiceType.DP,
        status: InvoiceStatus.VOID,
        amount: BigInt(1800000),
        paidAmount: BigInt(0),
        requestedById: salesUser.id,
        voidReason: 'Faktur duplikat uji',
        verifyToken: IDS.tokInvVoid,
      },
    });

    await prisma.payment.create({
      data: {
        id: IDS.paymentVerified,
        businessId,
        orderId: IDS.approvedOrder,
        invoiceId: IDS.dpInvoiceApproved,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: BigInt(1800000),
        paidAt: new Date('2026-11-12T04:00:00Z'),
        reference: 'BCA-E2E-01',
        createdById: IDS.salesUser,
        verifiedAt: new Date('2026-11-12T04:10:00Z'),
        receiptNo: IDS.receiptNo,
        verifyToken: IDS.tokPayVerified,
      },
    });

    await prisma.payment.create({
      data: {
        id: IDS.paymentPending,
        businessId,
        orderId: IDS.approvedOrder,
        invoiceId: IDS.dpInvoiceApproved,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.PENDING_VERIFICATION,
        amount: BigInt(500000),
        paidAt: new Date('2026-11-12T05:00:00Z'),
        reference: 'BCA-E2E-PENDING',
        createdById: IDS.salesUser,
      },
    });
  });

  test.afterAll(async () => {
    if (businessId) {
      await cleanupFixture(businessId);
    }
    await prisma.$disconnect();
  });

  test('Publik (Tanpa Login) memverifikasi Proforma, Faktur Approved, Void, dan Kwitansi di Mobile 360px & Desktop 1280px', async ({
    page,
  }) => {
    // Uji responsif di viewport mobile 360px dulu
    await page.setViewportSize({ width: 360, height: 800 });

    await page.goto(`/verify/${IDS.tokProforma}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('verify-status-banner')).toContainText(
      'PROFORMA ORDER'
    );
    const maskedName = await page.getByTestId('masked-customer-name').innerText();
    expect(maskedName).toMatch(/^PT /);
    expect(maskedName).not.toContain('Bahagia');

    const maskedAddress = await page.getByTestId('masked-customer-address').innerText();
    expect(maskedAddress).not.toContain('Kenanga');
    expect(maskedAddress).not.toContain('88');
    expect(maskedAddress).toContain('Bandung');

    const overflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowMobile).toBe(false);

    // Uji di desktop 1280px untuk Faktur Resmi, Void, Kwitansi Verified, & Token Tidak Valid
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`/verify/${IDS.tokInvApproved}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('verify-status-banner')).toContainText(
      'DOKUMEN RESMI TERVERIFIKASI'
    );
    await expect(page.getByText(IDS.receiptNo)).toBeVisible();

    await page.goto(`/verify/${IDS.tokInvVoid}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('verify-status-banner')).toContainText(
      'DOKUMEN DIBATALKAN'
    );

    await page.goto(`/verify/${IDS.tokPayVerified}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('verify-status-banner')).toContainText(
      'KWITANSI RESMI TERVERIFIKASI'
    );

    await page.goto('/verify/ver_tidak_valid_sama_sekali_999', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText('Kode Verifikasi Tidak Valid')).toBeVisible();
  });

  test('Sales melihat Cetak Kwitansi hanya pada pembayaran VERIFIED & Link Verifikasi QR pada Invoice', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginViaUi(page, IDS.salesUsername, IDS.salesPassword);

    // Mobile 360px check pada Order Detail
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/orders/${IDS.approvedOrder}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Riwayat Pembayaran')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(IDS.receiptNo)).toBeVisible({ timeout: 30_000 });

    // Hanya pembayaran VERIFIED yang punya tombol Cetak Kwitansi (tepat 1 link, bukan 2)
    const receiptLinks = page.getByRole('link', { name: /Cetak Kwitansi/i });
    await expect(receiptLinks).toHaveCount(1);
    const href = await receiptLinks.first().getAttribute('href');
    expect(href).toBe(`/api/v1/payments/${IDS.paymentVerified}/receipt/pdf`);

    const orderOverflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(orderOverflowMobile).toBe(false);

    // Desktop 1280px check pada Invoice Detail
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/invoices/${IDS.dpInvoiceApproved}`, {
      waitUntil: 'domcontentloaded',
    });
    const qrVerifyLink = page.getByRole('link', { name: /Link Verifikasi QR/i });
    await expect(qrVerifyLink).toBeVisible({ timeout: 30_000 });
    expect(await qrVerifyLink.getAttribute('href')).toBe(
      `/verify/${IDS.tokInvApproved}`
    );
    await expect(page.getByText('Riwayat Pembayaran & Kwitansi')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Cetak Kwitansi/i })
    ).toHaveCount(1);

    const invOverflowDesktop = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(invOverflowDesktop).toBe(false);
  });
});
