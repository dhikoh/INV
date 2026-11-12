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
import { DEFAULT_PAYMENT_LEGAL_NOTICE } from '../../src/lib/domain/paymentPolicy';

test.use({
  channel: 'chrome',
});

const PREFIX = 'p1_e2e_';
const IDS = {
  salesUser: `${PREFIX}sales_usr`,
  salesUsername: `${PREFIX}sales_tester`,
  salesPassword: 'TestSalesPassword#2026',
  customer: `${PREFIX}cust_01`,
  product: `${PREFIX}prod_01`,
  draftOrder: `${PREFIX}ord_draft`,
  awaitingDpOrder: `${PREFIX}ord_awaiting_dp`,
  inProcessOrder: `${PREFIX}ord_inproc_dp`,
  dpInvoiceAwaiting: `${PREFIX}inv_dp_awaiting`,
  dpInvoicePaid: `${PREFIX}inv_dp_paid`,
  paymentVerified: `${PREFIX}pay_dp_verified`,
};

let businessId = '';
let originalPolicy: {
  showBankOnProforma: boolean;
  paymentLegalNotice: string | null;
  allowSalesCashPayment: boolean;
  requireTransferProofForSales: boolean;
} | null = null;

async function cleanupFixture(bizId: string) {
  await prisma.customerCreditEntry.deleteMany({
    where: { businessId: bizId, customerId: IDS.customer },
  });
  await prisma.notification.deleteMany({
    where: { userId: IDS.salesUser },
  });
  await prisma.payment.deleteMany({
    where: { businessId: bizId, orderId: { in: [IDS.draftOrder, IDS.awaitingDpOrder, IDS.inProcessOrder] } },
  });
  await prisma.invoice.deleteMany({
    where: { businessId: bizId, orderId: { in: [IDS.draftOrder, IDS.awaitingDpOrder, IDS.inProcessOrder] } },
  });
  await prisma.orderItem.deleteMany({
    where: { businessId: bizId, orderId: { in: [IDS.draftOrder, IDS.awaitingDpOrder, IDS.inProcessOrder] } },
  });
  await prisma.order.deleteMany({
    where: { businessId: bizId, id: { in: [IDS.draftOrder, IDS.awaitingDpOrder, IDS.inProcessOrder] } },
  });
  await prisma.customer.deleteMany({ where: { businessId: bizId, id: IDS.customer } });
  await prisma.product.deleteMany({ where: { businessId: bizId, id: IDS.product } });
  await prisma.session.deleteMany({ where: { userId: IDS.salesUser } });
  await prisma.user.deleteMany({ where: { id: IDS.salesUser } });
}

test.describe('Fase 1 E2E UI Tests (Desktop 1280px & Mobile 360px)', () => {
async function loginViaUi(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.fill('input#username', username);
  await page.fill('input[type="password"]', password);
  const [loginRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST', {
      timeout: 30000,
    }),
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
    originalPolicy = {
      showBankOnProforma: biz.showBankOnProforma,
      paymentLegalNotice: biz.paymentLegalNotice,
      allowSalesCashPayment: biz.allowSalesCashPayment,
      requireTransferProofForSales: biz.requireTransferProofForSales,
    };

    await cleanupFixture(businessId);

    // Pastikan kebijakan awal ketat aktif
    await prisma.business.update({
      where: { id: businessId },
      data: {
        showBankOnProforma: false,
        allowSalesCashPayment: false,
        requireTransferProofForSales: true,
        paymentLegalNotice: null,
      },
    });

    const passwordHash = await hashPassword(IDS.salesPassword, IDS.salesUsername);
    const salesUser = await prisma.user.create({
      data: {
        id: IDS.salesUser,
        username: IDS.salesUsername,
        passwordHash,
        name: 'Sales Fase 1 E2E',
        role: Role.SALES,
        businessId,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const superAdmin = await prisma.user.findFirstOrThrow({
      where: { role: Role.SUPERADMIN, deletedAt: null },
    });

    const customer = await prisma.customer.create({
      data: {
        id: IDS.customer,
        businessId,
        code: 'P1E2ECUST',
        name: 'PT Petshop E2E Fase1',
        contactName: 'Rina',
        phone: '081234567890',
        address: 'Jl. Uji Fase 1 No. 10, Surabaya',
        assignedSalesId: salesUser.id,
      },
    });

    const product = await prisma.product.create({
      data: {
        id: IDS.product,
        businessId,
        sku: 'P1-E2E-SKU',
        name: 'Pasir Uji Fase 1 10L',
        unit: 'zak',
        costPrice: BigInt(50_000),
        basePrice: BigInt(100_000),
        minPrice: BigInt(80_000),
        stockQty: 100,
        reservedQty: 10,
      },
    });

    const baseLine = {
      businessId,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      qty: 10,
      listPrice: BigInt(100_000),
      unitPrice: BigInt(100_000),
      lineSubtotal: BigInt(1_000_000),
      lineDiscount: BigInt(0),
      lineNet: BigInt(1_000_000),
      costPrice: BigInt(50_000),
      floorPrice: BigInt(80_000),
      belowMin: false,
      sortOrder: 0,
    };

    // 1. Order DRAFT untuk uji Cetak Proforma PDF & Kirim WA
    await prisma.order.create({
      data: {
        id: IDS.draftOrder,
        businessId,
        customerId: customer.id,
        salesId: salesUser.id,
        status: OrderStatus.DRAFT,
        orderDate: new Date('2026-11-12T00:00:00Z'),
        subtotal: BigInt(1_000_000),
        grandTotal: BigInt(1_000_000),
        dpBps: 5000,
        dpAmount: BigInt(500_000),
        items: { create: baseLine },
      },
    });

    // 2. Order AWAITING_DP untuk uji blokir Cash & wajib bukti Transfer oleh Sales
    await prisma.order.create({
      data: {
        id: IDS.awaitingDpOrder,
        businessId,
        customerId: customer.id,
        salesId: salesUser.id,
        status: OrderStatus.AWAITING_DP,
        customerSeq: 901,
        orderNo: 'P1E2ECUST/INV/12/11/2026/0901',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        subtotal: BigInt(1_000_000),
        grandTotal: BigInt(1_000_000),
        dpBps: 5000,
        dpAmount: BigInt(500_000),
        stockReserved: true,
        items: { create: baseLine },
      },
    });
    await prisma.invoice.create({
      data: {
        id: IDS.dpInvoiceAwaiting,
        businessId,
        orderId: IDS.awaitingDpOrder,
        customerId: customer.id,
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'P1E2ECUST/INV/12/11/2026/0901-DP',
        amount: BigInt(500_000),
        paidAmount: BigInt(0),
        requestedById: salesUser.id,
        approvedById: superAdmin.id,
        approvedAt: new Date(),
      },
    });

    // 3. Order IN_PROCESS dengan DP terverifikasi untuk uji Batalkan Pesanan resmi oleh Super Admin
    await prisma.order.create({
      data: {
        id: IDS.inProcessOrder,
        businessId,
        customerId: customer.id,
        salesId: salesUser.id,
        status: OrderStatus.IN_PROCESS,
        customerSeq: 902,
        orderNo: 'P1E2ECUST/INV/12/11/2026/0902',
        orderDate: new Date('2026-11-12T00:00:00Z'),
        subtotal: BigInt(1_000_000),
        grandTotal: BigInt(1_000_000),
        dpBps: 5000,
        dpAmount: BigInt(500_000),
        paidTotal: BigInt(500_000),
        stockReserved: true,
        items: { create: baseLine },
      },
    });
    await prisma.invoice.create({
      data: {
        id: IDS.dpInvoicePaid,
        businessId,
        orderId: IDS.inProcessOrder,
        customerId: customer.id,
        type: InvoiceType.DP,
        status: InvoiceStatus.APPROVED,
        number: 'P1E2ECUST/INV/12/11/2026/0902-DP',
        amount: BigInt(500_000),
        paidAmount: BigInt(500_000),
        requestedById: salesUser.id,
        approvedById: superAdmin.id,
        approvedAt: new Date(),
      },
    });
    await prisma.payment.create({
      data: {
        id: IDS.paymentVerified,
        businessId,
        orderId: IDS.inProcessOrder,
        invoiceId: IDS.dpInvoicePaid,
        type: PaymentType.RECEIPT,
        method: PaymentMethod.TRANSFER,
        status: PaymentStatus.VERIFIED,
        amount: BigInt(500_000),
        paidAt: new Date(),
        reference: 'BCA-E2E-DP',
        createdById: salesUser.id,
        verifiedById: superAdmin.id,
        verifiedAt: new Date(),
      },
    });
  });

  test.afterAll(async () => {
    if (businessId && originalPolicy) {
      await prisma.business.update({
        where: { id: businessId },
        data: originalPolicy,
      });
    }
    if (businessId) {
      await cleanupFixture(businessId);
    }
    await prisma.$disconnect();
  });

  test('Super Admin: Pengaturan Anti-Fraud (/settings/business), Pembatalan Resmi Pesanan ber-DP, & Responsivitas Mobile 360px', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const saUsername =
      process.env.E2E_SUPERADMIN_USERNAME ||
      process.env.SEED_SUPERADMIN_USERNAME ||
      'superadmin';
    const saPassword =
      process.env.E2E_SUPERADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
    if (!saPassword) {
      throw new Error('E2E_SUPERADMIN_PASSWORD wajib tersedia di environment');
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await loginViaUi(page, saUsername, saPassword);

    // 1. Uji UI /settings/business: toggle & klausul legal pembayaran PDF + Reset
    await page.goto('/settings/business', { waitUntil: 'networkidle' });
    await expect(page.getByText('Tampilkan Rekening Bank di Proforma PDF')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Klausul Pembayaran Sah PDF (Anti-Fraud)')).toBeVisible();

    const customLegal = 'E2E TEST KLAUSUL SAH PT BENTOCAT MANDIRI.';
    const legalTextarea = page.locator('textarea').filter({
      hasText: 'PERHATIAN: Pembayaran HANYA',
    }).or(page.locator('textarea[placeholder*="PERHATIAN"]'));
    await legalTextarea.first().fill(customLegal);
    await page.getByRole('button', { name: /Simpan Pengaturan/i }).click();
    await expect(page.getByText(/berhasil diperbarui/i)).toBeVisible({ timeout: 15000 });

    await page.reload({ waitUntil: 'networkidle' });
    await expect(legalTextarea.first()).toHaveValue(customLegal, { timeout: 15000 });

    // Reset ke Teks Default
    await page.getByRole('button', { name: /Reset ke Teks Default/i }).click();
    await expect(legalTextarea.first()).toHaveValue(DEFAULT_PAYMENT_LEGAL_NOTICE);
    await page.getByRole('button', { name: /Simpan Pengaturan/i }).click();
    await expect(page.getByText(/berhasil diperbarui/i)).toBeVisible({ timeout: 15000 });

    // Cek responsivitas 360px di /settings/business
    await page.setViewportSize({ width: 360, height: 740 });
    const settingsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5
    );
    expect(settingsOverflow).toBe(true);

    // 2. Uji Batalkan Pesanan Resmi pada order IN_PROCESS yang sudah ada DP
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/orders/${IDS.inProcessOrder}`, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: 'P1E2ECUST/INV/12/11/2026/0902' })
    ).toBeVisible({ timeout: 20000 });

    // Pastikan tombol Hapus Draf tersembunyi untuk order aktif
    await expect(page.getByRole('button', { name: /Hapus Draf/i })).toHaveCount(0);

    // Klik Batalkan Pesanan
    await page.getByRole('button', { name: /Batalkan Pesanan/i }).click();
    await expect(page.getByText('Dana Masuk / DP Terverifikasi:')).toBeVisible();
    await page.getByText('Simpan sebagai Saldo Kredit Pelanggan').click();
    await page
      .getByPlaceholder(/Jelaskan alasan pembatalan pesanan/i)
      .fill('Customer membatalkan pesanan setelah bayar DP');
    await page.getByRole('button', { name: /Konfirmasi Batalkan Pesanan/i }).click();

    await expect(page.getByText('Pesanan Dibatalkan Resmi')).toBeVisible({ timeout: 15000 });

    // Cek responsivitas mobile 360px pada halaman detail order
    await page.setViewportSize({ width: 360, height: 740 });
    const orderOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5
    );
    expect(orderOverflow).toBe(true);
  });

  test('Sales: Cetak Proforma PDF, Kirim WA, & Penegakan Anti-Fraud Pembayaran (Tanpa Cash + Wajib Bukti Transfer)', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginViaUi(page, IDS.salesUsername, IDS.salesPassword);

    // 1. Uji DRAFT order: Proforma PDF & Kirim WA + 360px
    await page.goto(`/orders/${IDS.draftOrder}`);
    await expect(page.getByRole('link', { name: /Cetak Proforma PDF/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: /Kirim WA/i })).toBeVisible();

    const pdfRes = await page.request.get(`/api/v1/orders/${IDS.draftOrder}/proforma/pdf`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');
    const pdfBytes = await pdfRes.body();
    expect(pdfBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    await page.setViewportSize({ width: 360, height: 740 });
    const draftOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 5
    );
    expect(draftOverflow).toBe(true);

    // 2. Uji AWAITING_DP order: modal Catat Pembayaran mematuhi kebijakan usaha
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/orders/${IDS.awaitingDpOrder}`, { waitUntil: 'networkidle' });
    const payBtn = page.getByRole('button', { name: /Catat Pembayaran/i }).first();
    await expect(payBtn).toBeVisible({ timeout: 30000 });
    await payBtn.click();

    await expect(
      page.getByRole('heading', { name: 'Catat Pembayaran Masuk' })
    ).toBeVisible();
    await expect(
      page.getByText('Pembayaran tunai oleh Sales dinonaktifkan oleh kebijakan usaha.')
    ).toBeVisible();
    await expect(page.getByText('* Wajib untuk Sales')).toBeVisible();

    // Opsi CASH tidak boleh muncul pada dropdown metode pembayaran untuk Sales
    const cashOptionCount = await page.locator('select option[value="CASH"]').count();
    expect(cashOptionCount).toBe(0);

    // Coba simpan Transfer tanpa bukti -> wajib ditolak UI
    await page.getByRole('button', { name: /Simpan Pembayaran/i }).click();
    await expect(
      page.getByText(/Sales wajib mengunggah bukti transfer/i)
    ).toBeVisible();
  });
});
