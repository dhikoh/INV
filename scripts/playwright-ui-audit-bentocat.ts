import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import {
  chromium,
  Browser,
  BrowserContext,
  Page,
  ConsoleMessage,
  Response,
} from '@playwright/test';

interface RouteCheckResult {
  route: string;
  status: number;
  finalUrl: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedApiCalls: string[];
  hasHorizontalOverflowDesktop: boolean;
  hasHorizontalOverflowMobile: boolean;
  overflowDetailsMobile: string[];
  titleOrHeading: string;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    try {
      return await chromium.launch({ channel: 'msedge', headless: true });
    } catch {
      return await chromium.launch({ headless: true });
    }
  }
}

async function loginViaUI(page: Page, username: string, password: string): Promise<void> {
  const loginErrors: string[] = [];
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === 'error') loginErrors.push(m.text());
  };
  const onPageError = (e: Error) => {
    loginErrors.push(e.message);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('input#username', username);
  await page.fill('input#password', password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|profile)/, { timeout: 25000 }),
    page.click('button[type="submit"]'),
  ]);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  if (loginErrors.length > 0) {
    console.log('   ⚠️ Login console/page errors:', loginErrors);
  }
}

async function findOverflowElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const offenders: string[] = [];
    const elements = Array.from(document.querySelectorAll('body *'));
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.right > docWidth + 2) {
        const tag = el.tagName.toLowerCase();
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 3).join('.') : '';
        offenders.push(`${tag}${cls ? '.' + cls : ''}(right=${Math.round(rect.right)}>${docWidth})`);
        if (offenders.length >= 5) break;
      }
    }
    return offenders;
  });
}

async function crawlRoutes(
  context: BrowserContext,
  routes: string[],
  roleLabel: string
): Promise<RouteCheckResult[]> {
  const results: RouteCheckResult[] = [];
  const page = await context.newPage();

  for (const route of routes) {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedApiCalls: string[] = [];

    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };
    const onPageError = (err: Error) => {
      pageErrors.push(err.message);
    };
    const onResponse = (res: Response) => {
      const url = res.url();
      const status = res.status();
      if (status >= 500) {
        failedApiCalls.push(`${status} ${res.request().method()} ${url}`);
      } else if (status === 404 && !url.endsWith('favicon.ico')) {
        failedApiCalls.push(`404 ${res.request().method()} ${url}`);
      }
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    await page.setViewportSize({ width: 1280, height: 800 });
    let status = 0;
    try {
      const res = await page.goto(`http://localhost:3000${route}`, {
        waitUntil: 'networkidle',
        timeout: 25000,
      });
      status = res?.status() || 0;
    } catch (e: unknown) {
      pageErrors.push(`Navigation error: ${e instanceof Error ? e.message : String(e)}`);
    }

    await page.waitForTimeout(450);

    const overflowDesktop = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
    });

    const heading = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent?.trim() || '' : document.title;
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(250);
    const overflowMobile = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
    });
    const overflowDetailsMobile = overflowMobile ? await findOverflowElements(page) : [];

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);

    results.push({
      route,
      status,
      finalUrl: page.url(),
      consoleErrors,
      pageErrors,
      failedApiCalls,
      hasHorizontalOverflowDesktop: overflowDesktop,
      hasHorizontalOverflowMobile: overflowMobile,
      overflowDetailsMobile,
      titleOrHeading: heading,
    });

    const mark =
      status === 200 &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        failedApiCalls.length === 0 &&
        !overflowDesktop &&
        !overflowMobile
        ? '✅'
        : '⚠️';
    console.log(
      `   [${roleLabel}] ${mark} ${route.padEnd(20)} | HTTP ${status} | DeskOF:${overflowDesktop ? 'YES' : 'No'} MobOF:${overflowMobile ? 'YES' : 'No'} | "${heading.slice(0, 32)}"`
    );
    if (consoleErrors.length > 0) console.log('      ❌ Console:', consoleErrors);
    if (pageErrors.length > 0) console.log('      ❌ PageError:', pageErrors);
    if (failedApiCalls.length > 0) console.log('      ❌ API Error:', failedApiCalls);
    if (overflowDetailsMobile.length > 0) console.log('      ⚠️ Mobile Overflow Elements:', overflowDetailsMobile);
  }

  await page.close();
  return results;
}

async function fetchPdfMeta(page: Page, href: string | null) {
  return page.evaluate(async (url: string | null) => {
    if (!url) return { status: 0, ct: null as string | null, size: 0, hdr: '' };
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const hdr = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
    return {
      status: res.status,
      ct: res.headers.get('content-type'),
      size: buf.byteLength,
      hdr,
    };
  }, href);
}

async function runPlaywrightAudit() {
  console.log('================================================================');
  console.log('🌐 PLAYWRIGHT BROWSER UI & BUTTON AUDIT - BENTOCAT');
  console.log('================================================================\n');

  const saUsername = process.env.E2E_SUPERADMIN_USERNAME || process.env.SEED_SUPERADMIN_USERNAME || 'superadmin';
  const saPassword = process.env.E2E_SUPERADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
  const salesUsername = process.env.E2E_SALES_USERNAME || 'bentocat';
  const salesPassword = process.env.E2E_SALES_PASSWORD || process.env.BENTOCAT_INITIAL_PASSWORD;
  if (!saPassword || !salesPassword) {
    throw new Error('Wajib setel E2E_SUPERADMIN_PASSWORD dan E2E_SALES_PASSWORD pada environment / .env');
  }

  const browser = await launchBrowser();
  const auditIssues: string[] = [];

  try {
    // ============================================================
    // BAGIAN 1: SISI SALES (bentocat)
    // ============================================================
    console.log('👤 1. CRAWLING & INTERAKSI UI SISI SALES (bentocat):');
    const salesContext = await browser.newContext();
    const salesPage = await salesContext.newPage();
    const salesRuntimeErrors: string[] = [];
    salesPage.on('pageerror', (e: Error) => salesRuntimeErrors.push(`SalesPageError: ${e.message}`));
    salesPage.on('response', (res: Response) => {
      if (res.status() >= 500) {
        salesRuntimeErrors.push(`Sales HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
      }
    });

    await loginViaUI(salesPage, salesUsername, salesPassword);
    console.log('   ✅ Login Sales via UI (/login) -> Masuk ke:', salesPage.url());

    const salesRoutes = [
      '/dashboard',
      '/orders',
      '/orders/new',
      '/invoices',
      '/receivables',
      '/customers',
      '/catalogs',
      '/products',
      '/price-list',
      '/reports/crm',
      '/reminders',
      '/profile',
    ];
    const salesCrawl = await crawlRoutes(salesContext, salesRoutes, 'SALES');
    for (const r of salesCrawl) {
      if (r.status !== 200 || r.consoleErrors.length || r.pageErrors.length || r.failedApiCalls.length) {
        auditIssues.push(`SALES ${r.route}: status=${r.status}, err=${r.consoleErrors.length + r.pageErrors.length + r.failedApiCalls.length}`);
      }
      if (r.hasHorizontalOverflowDesktop || r.hasHorizontalOverflowMobile) {
        auditIssues.push(`SALES ${r.route} overflow: desk=${r.hasHorizontalOverflowDesktop}, mob=${r.hasHorizontalOverflowMobile}`);
      }
    }

    // Check Sales Mobile Quick-Nav on /profile (390px)
    await salesPage.setViewportSize({ width: 390, height: 844 });
    await salesPage.goto('http://localhost:3000/profile', { waitUntil: 'networkidle' });
    await salesPage.waitForSelector('text=Akses Cepat Menu Sales', { timeout: 8000 });
    const quickHrefs = await salesPage
      .locator('a[href="/invoices"], a[href="/receivables"], a[href="/catalogs"], a[href="/products"], a[href="/price-list"], a[href="/reports/crm"], a[href="/reminders"], a[href="/orders/new"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    const requiredQuickHrefs = ['/orders/new', '/invoices', '/receivables', '/catalogs', '/products', '/price-list', '/reports/crm', '/reminders'];
    const missingQuick = requiredQuickHrefs.filter((h) => !quickHrefs.includes(h));
    console.log(`      - Mobile Sales Quick-Nav (/profile 390px): lengkap=${missingQuick.length === 0 ? '✅ YA' : '❌ KURANG: ' + missingQuick.join(',')}`);
    if (missingQuick.length > 0) {
      auditIssues.push(`Sales mobile /profile missing quick links: ${missingQuick.join(',')}`);
    }
    await salesPage.locator('a[href="/invoices"]').last().click();
    await salesPage.waitForURL(/\/invoices$/, { timeout: 8000 });

    // Check Sales Sidebar & URL RBAC Guard (NAV-006)
    console.log('\n   🔒 Uji Guard Navigasi & Sidebar Sisi Sales:');
    await salesPage.setViewportSize({ width: 1280, height: 800 });
    await salesPage.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    const sidebarLinks = await salesPage.locator('aside nav a').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') || '')
    );
    const forbiddenInSidebar = ['/approvals', '/settings/users', '/audit', '/vendors', '/purchase-orders'].filter((p) =>
      sidebarLinks.includes(p)
    );
    console.log(`      - Tautan SuperAdmin tersembunyi di Sidebar Sales: ${forbiddenInSidebar.length === 0 ? '✅ AMAN' : '❌ BOCOR: ' + forbiddenInSidebar.join(',')}`);
    if (forbiddenInSidebar.length > 0) auditIssues.push(`Sales sidebar leaks: ${forbiddenInSidebar.join(',')}`);

    await salesPage.goto('http://localhost:3000/approvals', { waitUntil: 'networkidle' });
    await salesPage.waitForTimeout(600);
    const blockedTextVisible = await salesPage.locator('h3:has-text("Akses Dibatasi")').isVisible();
    console.log(`      - Guard Akses Langsung /approvals oleh Sales: ${blockedTextVisible ? '✅ DIBLOKIR ("Akses Dibatasi" tampil)' : '❌ TIDAK TERBLOKIR'}`);
    if (!blockedTextVisible) auditIssues.push('Sales direct access to /approvals not restricted');

    // Test Create Draft Order in UI (/orders/new)
    console.log('\n   📝 Uji Interaksi Form Buat Order (/orders/new) & Tambah/Hapus Baris di Browser:');
    await salesPage.goto('http://localhost:3000/orders/new', { waitUntil: 'networkidle' });

    const customerSelect = salesPage.locator('select').first();
    await customerSelect.waitFor({ state: 'visible' });
    const customerOpts = await customerSelect.locator('option').allInnerTexts();
    console.log(`      - Pelanggan terbaca di dropdown: ${customerOpts.length - 1} toko`);
    await customerSelect.selectOption({ index: 1 });

    // Click Tambah Produk to verify dynamic row addition & removal
    const rowDeleteBtns = salesPage.locator('button[title="Hapus baris"]');
    while ((await rowDeleteBtns.count()) < 2) {
      await salesPage.locator('button:has-text("Tambah Produk")').first().click();
      await salesPage.waitForTimeout(150);
    }
    console.log(`      - Tombol "Tambah Produk" berfungsi (jumlah baris item=${await rowDeleteBtns.count()})`);
    await rowDeleteBtns.last().click();
    await salesPage.waitForTimeout(150);
    console.log(`      - Tombol "Hapus baris" berfungsi (sisa baris item=${await rowDeleteBtns.count()})`);

    const productSelect = salesPage.locator('select').nth(1);
    await productSelect.selectOption({ index: 1 });

    const qtyInput = salesPage.locator('input[type="number"]').first();
    await qtyInput.fill('50');

    // Ensure DP is set to 30% so both DP Invoice & Final Invoice stages are exercised
    const dpInput = salesPage.locator('input[inputmode="decimal"]').first();
    if (await dpInput.isVisible()) {
      await dpInput.fill('30');
    }

    await salesPage.waitForTimeout(900);
    const grandTotalText = await salesPage.locator('text=Grand Total').locator('..').innerText();
    console.log('      - Live Preview Kalkulasi Harga:', grandTotalText.replace(/\s+/g, ' ').trim());
    if (grandTotalText.includes('Rp Rp')) {
      auditIssues.push(`Duplicate currency prefix in OrderForm: ${grandTotalText}`);
    }

    // Handle CustomerMinPrice / below-floor alert if triggered on BentoCat imported store
    const belowMinTextarea = salesPage.locator('textarea[placeholder*="order partai besar"]');
    if (await belowMinTextarea.isVisible()) {
      console.log('      - ℹ️ CustomerMinPrice/Below-Min terdeteksi -> uji pre-validasi modal lalu isi belowMinReason');
      await salesPage.click('button:has-text("Simpan Draf Pesanan")');
      await salesPage.waitForTimeout(250);
      const modalNotOpened = (await salesPage.locator('button:has-text("Ya, Simpan Pesanan")').count()) === 0;
      const errBannerVisible = await salesPage.locator('text=Alasan bisnis wajib diisi').isVisible();
      console.log(
        `      - Pre-validasi belowMinReason: Modal tertutup=${modalNotOpened ? '✅ YA' : '❌ MACET'}, Error tampil=${errBannerVisible ? '✅ YA' : '❌ TIDAK'}`
      );
      if (!modalNotOpened || !errBannerVisible) {
        auditIssues.push('OrderForm confirm modal locked behind empty belowMinReason');
      }
      await belowMinTextarea.fill('Penyesuaian harga katalog resmi BentoCat untuk loyal customer 50 sak');
    }

    const postPromise = salesPage.waitForResponse(
      (res: Response) => res.url().includes('/api/v1/orders') && res.request().method() === 'POST',
      { timeout: 15000 }
    );
    await salesPage.click('button:has-text("Simpan Draf Pesanan")');
    await salesPage.waitForSelector('button:has-text("Ya, Simpan Pesanan")', { timeout: 8000 });
    await salesPage.click('button:has-text("Ya, Simpan Pesanan")');

    const postRes = await postPromise;
    const postJson = await postRes.json().catch(() => ({}));
    console.log(`      - POST /api/v1/orders HTTP ${postRes.status()}:`, JSON.stringify(postJson).slice(0, 180));
    if (!postRes.ok()) {
      throw new Error(`POST /api/v1/orders failed: ${postRes.status()} ${JSON.stringify(postJson)}`);
    }

    await salesPage.waitForURL(/\/orders\/(?!new$)[a-z0-9_-]+$/i, { waitUntil: 'commit', timeout: 15000 });
    const createdOrderUrl = salesPage.url();
    const createdOrderId = createdOrderUrl.split('/').pop()!;
    console.log('      ✅ Order Draf Berhasil Dibuat lewat UI! ID:', createdOrderId);

    // Check action buttons on Order Detail Page as Sales (DRAFT)
    await salesPage.waitForLoadState('networkidle');
    await salesPage.waitForTimeout(500);
    const salesButtons = await salesPage.locator('button:visible, a:visible').allInnerTexts();
    const salesActionLabels = salesButtons
      .map((t: string) => t.replace(/\s+/g, ' ').trim())
      .filter((t: string) => t.length > 0);
    console.log(
      '      - Tombol Aksi di Detail Pesanan (DRAFT, Sisi Sales):',
      salesActionLabels.filter((t: string) =>
        ['Ajukan Pesanan', 'Edit Draf', 'Setujui', 'Tolak', 'Hapus', 'Laba Riil'].some((k) => t.includes(k))
      )
    );

    // Guard UI checks for Sales
    const hasApproveBtnForSales = await salesPage.locator('button:has-text("Setujui Pesanan")').count();
    const hasProfitSimForSales = await salesPage.locator('text=Laba Riil & Komisi').count();
    console.log(
      `      - Guard UI Sales: Approve tersembunyi=${hasApproveBtnForSales === 0 ? '✅ YA' : '❌ BOCOR'}, Laba Riil tersembunyi=${hasProfitSimForSales === 0 ? '✅ YA' : '❌ BOCOR'}`
    );
    if (hasApproveBtnForSales > 0 || hasProfitSimForSales > 0) {
      auditIssues.push('Sales UI RBAC leak on /orders/[id]');
    }

    // Click Ajukan Pesanan button in UI -> submit modal
    const ajukanBtn = salesPage.locator('button:has-text("Ajukan Pesanan")').first();
    await ajukanBtn.waitFor({ state: 'visible' });
    await ajukanBtn.click();
    await salesPage.waitForSelector('div.fixed h3:has-text("Ajukan Pesanan untuk Persetujuan")', { timeout: 5000 });
    const confirmSubmitBtn = salesPage.locator('div.fixed button[type="submit"]:has-text("Ajukan Pesanan")');
    await confirmSubmitBtn.click();
    await salesPage.waitForSelector('button:has-text("Tarik Pengajuan")', { timeout: 10000 });
    console.log('      ✅ Tombol "Ajukan Pesanan" berhasil di UI -> status berubah ke PENDING_APPROVAL!');

    // Biarkan salesContext tetap terbuka untuk verifikasi sinkronisasi bi-direksional Sales <-> SuperAdmin

    // ============================================================
    // BAGIAN 2: SISI SUPERADMIN (superadmin)
    // ============================================================
    console.log('\n👑 2. CRAWLING & INTERAKSI UI SISI SUPERADMIN (superadmin):');
    const saContext = await browser.newContext();
    const saPage = await saContext.newPage();

    const saRuntimeErrors: string[] = [];
    saPage.on('pageerror', (e: Error) => saRuntimeErrors.push(`PageError: ${e.message}`));
    saPage.on('response', async (res: Response) => {
      if (res.status() >= 500) {
        saRuntimeErrors.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
      } else if (res.status() >= 400 && res.url().includes('/api/v1/')) {
        const body = await res.text().catch(() => '');
        console.log(`   ⚠️ [API ${res.status()}] ${res.request().method()} ${res.url()} -> ${body.slice(0, 220)}`);
      }
    });

    await loginViaUI(saPage, saUsername, saPassword);
    console.log('   ✅ Login SuperAdmin via UI (/login) -> Masuk ke:', saPage.url());

    // Ensure Business Context is switched to BENTOCAT
    await saPage.waitForTimeout(400);
    const bodyText = await saPage.locator('body').innerText();
    if (!bodyText.includes('BENTOCAT')) {
      await saPage.evaluate(async () => {
        await fetch('/api/v1/session/business', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId: 'biz_bentocat_blitar_01' }),
        });
      });
      await saPage.reload({ waitUntil: 'networkidle' });
      console.log('   ℹ️ Switch business context ke BENTOCAT berhasil.');
    }

    // Get order details cleanly for /approvals verification & partial DP testing
    const initialOrderJson = await saPage.evaluate(async (oid: string) => {
      const r = await fetch(`/api/v1/orders/${oid}`);
      return r.json();
    }, createdOrderId);
    const createdOrderNo: string = initialOrderJson.data.orderNo || '';
    const dpAmount: number = initialOrderJson.data.dpAmount;
    const grandTotal: number = initialOrderJson.data.grandTotal;

    // Check /approvals page displays our submitted order
    console.log('\n   🛡️ Uji Antrean Persetujuan (/approvals) & Siklus Penuh Order di UI:');
    await saPage.setViewportSize({ width: 1280, height: 800 });
    await saPage.goto('http://localhost:3000/approvals', { waitUntil: 'networkidle' });
    const pendingInvId = initialOrderJson.data.pendingInvoice?.id || initialOrderJson.data.invoices?.[0]?.id;
    const approvalsHasOrder =
      (pendingInvId ? (await saPage.locator(`a[href="/approvals/${pendingInvId}"]`).count()) > 0 : false) ||
      (await saPage.locator(`a[href="/orders/${createdOrderId}"]`).count()) > 0 ||
      (await saPage.locator(`text=DRAF #${createdOrderId.slice(-6)}`).count()) > 0 ||
      (createdOrderNo.length > 0 && (await saPage.locator(`text=${createdOrderNo}`).count()) > 0);
    console.log(`      - Order baru (${createdOrderNo || `DRAF #${createdOrderId.slice(-6)}`}) muncul di Antrean /approvals: ${approvalsHasOrder ? '✅ YA' : '❌ TIDAK'}`);
    if (!approvalsHasOrder) {
      auditIssues.push(`Submitted order ${createdOrderNo || createdOrderId} missing on /approvals`);
    }

    // Open Order Detail as SuperAdmin
    await saPage.goto(`http://localhost:3000/orders/${createdOrderId}`, { waitUntil: 'networkidle' });
    await saPage.waitForTimeout(500);
    const hasAdminProfitPanel = (await saPage.locator('text=Laba Riil & Komisi').count()) > 0;
    console.log(`      - Panel "Laba Riil & Komisi (Khusus Admin)" tampil: ${hasAdminProfitPanel ? '✅ YA' : '❌ TIDAK'}`);
    console.log(`      - Nominal Order: GrandTotal=Rp${grandTotal.toLocaleString('id-ID')}, DP=Rp${dpAmount.toLocaleString('id-ID')}`);

    // 1. Approve DP Invoice via UI modal
    await saPage.locator('button:has-text("Setujui Pesanan")').first().click();
    await saPage.waitForSelector('div.fixed h3:has-text("Setujui Pesanan & Terbitkan Faktur")', { timeout: 5000 });
    const overrideNoteBox = saPage.locator('div.fixed textarea[placeholder*="Disetujui khusus"]');
    if (await overrideNoteBox.isVisible()) {
      console.log('      - ℹ️ Order belowMin -> SuperAdmin mengisi overrideNote persetujuan khusus');
      await overrideNoteBox.fill('Disetujui khusus oleh Owner BentoCat karena volume 50 sak');
    }
    await saPage.locator('div.fixed button[type="submit"]:has-text("Setujui & Terbitkan Invoice")').click();
    await saPage.waitForSelector('a:has-text("Cetak PDF")', { timeout: 10000 });
    console.log('      ✅ 1) Approve Invoice DP via UI -> Invoice terbit & tombol "Cetak PDF" muncul!');

    // Verify Direct Browser Invoice PDF link & Token Download API (must be binary application/pdf with %PDF- magic)
    const dpInvHref = await saPage.locator('a:has-text("Cetak PDF")').first().getAttribute('href');
    const dpInvId = initialOrderJson.data.invoices[0]?.id;
    const pdfChecks = await saPage.evaluate(
      async ({ href, invoiceId }: { href: string | null; invoiceId: string }) => {
        const directRes = href ? await fetch(href) : null;
        const directBuf = directRes ? await directRes.arrayBuffer() : new ArrayBuffer(0);
        const directHdr = new TextDecoder().decode(new Uint8Array(directBuf).slice(0, 5));

        const tokRes = await fetch('/api/v1/downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'INVOICE_PDF', id: invoiceId }),
        });
        const tokJson = await tokRes.json();
        const dlRes = tokJson.ok ? await fetch(tokJson.data.url) : null;
        const dlBuf = dlRes ? await dlRes.arrayBuffer() : new ArrayBuffer(0);
        const dlHdr = new TextDecoder().decode(new Uint8Array(dlBuf).slice(0, 5));
        return {
          directStatus: directRes?.status,
          directCT: directRes?.headers.get('content-type'),
          directBytes: directBuf.byteLength,
          directHdr,
          tokenStatus: dlRes?.status,
          tokenCT: dlRes?.headers.get('content-type'),
          dlBytes: dlBuf.byteLength,
          dlHdr,
        };
      },
      { href: dpInvHref, invoiceId: dpInvId }
    );
    console.log('      ✅ 2) Cetak Invoice PDF (Direct & Download Token):', JSON.stringify(pdfChecks));
    if (
      pdfChecks.directStatus !== 200 ||
      pdfChecks.tokenStatus !== 200 ||
      !pdfChecks.directCT?.includes('application/pdf') ||
      !pdfChecks.tokenCT?.includes('application/pdf') ||
      pdfChecks.directHdr !== '%PDF-' ||
      pdfChecks.dlHdr !== '%PDF-' ||
      pdfChecks.directBytes < 1000 ||
      pdfChecks.dlBytes < 1000
    ) {
      auditIssues.push(`Invoice PDF failed: ${JSON.stringify(pdfChecks)}`);
    }

    // 2. Bi-directional Sales <-> SuperAdmin DP Flow:
    //    a) Sales melihat Invoice DP disetujui + mengunduh DP Invoice PDF
    //    b) Sales mencatat pembayaran DP (tanpa #autoVerifyCheck) -> PENDING_VERIFICATION
    //    c) SuperAdmin memverifikasi via halaman antrean /payments -> Order berubah ke IN_PROCESS
    //    d) Sales reload & memastikan status Order menjadi "Diproses" (IN_PROCESS) + VERIFIED
    await salesPage.goto(createdOrderUrl, { waitUntil: 'networkidle' });
    const salesDpInvHref = await salesPage.locator('a[href^="/api/v1/invoices/"]').first().getAttribute('href');
    const salesDpPdf = await fetchPdfMeta(salesPage, salesDpInvHref);
    if (
      salesDpPdf.status !== 200 ||
      !salesDpPdf.ct?.includes('application/pdf') ||
      salesDpPdf.hdr !== '%PDF-' ||
      salesDpPdf.size < 1000
    ) {
      auditIssues.push(`Sales DP Invoice PDF failed: ${JSON.stringify(salesDpPdf)}`);
    }

    await salesPage.locator('button:has-text("+ Catat Pembayaran"), button:has-text("Catat Pembayaran Masuk")').first().click();
    await salesPage.waitForSelector('div.fixed h3:has-text("Catat Pembayaran Masuk")', { timeout: 5000 });
    const salesPayModal = salesPage.locator('div.fixed:has(h3:has-text("Catat Pembayaran Masuk"))');
    if ((await salesPayModal.locator('#autoVerifyCheck').count()) > 0) {
      auditIssues.push('Sales payment modal illegally exposes #autoVerifyCheck');
    }
    await salesPayModal.locator('input[type="number"]').fill(String(dpAmount > 0 ? dpAmount : grandTotal));
    await salesPayModal.locator('input[placeholder*="BCA-"]').fill('UI-SALES-DP-001');
    await salesPayModal.locator('button[type="submit"]:has-text("Simpan Pembayaran")').click();
    await salesPayModal.waitFor({ state: 'detached', timeout: 10000 });
    await salesPage.waitForSelector('text=UI-SALES-DP-001', { timeout: 10000 });

    await saPage.goto('http://localhost:3000/payments', { waitUntil: 'networkidle' });
    const pendingDpCard = saPage.locator('div.bg-white.rounded-xl').filter({ hasText: 'UI-SALES-DP-001' }).first();
    await pendingDpCard.waitFor({ state: 'visible', timeout: 10000 });
    await pendingDpCard.locator('button:has-text("Verifikasi")').first().click();
    const saQueueVerifyModal = saPage.locator('div.fixed:has(h3:has-text("Verifikasi Pembayaran"))');
    await saQueueVerifyModal.waitFor({ state: 'visible', timeout: 5000 });
    await saQueueVerifyModal.locator('button:has-text("Ya, Verifikasi Pembayaran")').click();
    await saQueueVerifyModal.waitFor({ state: 'detached', timeout: 10000 });

    await saPage.goto(createdOrderUrl, { waitUntil: 'networkidle' });
    await saPage.waitForSelector('button:has-text("Ajukan Pelunasan")', { timeout: 10000 });

    await salesPage.reload({ waitUntil: 'networkidle' });
    await salesPage.waitForSelector('span:has-text("Diproses")', { timeout: 10000 });
    await salesPage.waitForSelector('span:has-text("VERIFIED")', { timeout: 10000 });
    if (
      (await salesPage.locator('button:has-text("Setujui Pesanan")').count()) > 0 ||
      (await salesPage.locator('text=Laba Riil & Komisi').count()) > 0
    ) {
      auditIssues.push('Sales order detail RBAC leak after IN_PROCESS');
    }
    console.log('      ✅ 3) Bi-directional Sales DP PDF + Catat DP Sales -> Verifikasi SuperAdmin (/payments) -> Sales IN_PROCESS & VERIFIED LULUS!');

    // 3. Request Final Invoice via UI modal
    await saPage.locator('button:has-text("Ajukan Pelunasan")').first().click();
    const reqFinalModal = saPage.locator('div.fixed:has(h3:has-text("Ajukan Faktur Pelunasan"))');
    await reqFinalModal.waitFor({ state: 'visible', timeout: 5000 });
    await reqFinalModal.locator('button[type="submit"]:has-text("Ajukan Pelunasan")').click();
    await reqFinalModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('button:has-text("Setujui Pesanan")', { timeout: 10000 });
    console.log('      ✅ 4) Ajukan Faktur Pelunasan via UI -> Status Order menjadi FINAL_PENDING_APPROVAL!');

    // 4. Approve Final Invoice via UI modal
    await saPage.locator('button:has-text("Setujui Pesanan")').first().click();
    const approveFinalModal = saPage.locator('div.fixed:has(h3:has-text("Setujui Pesanan & Terbitkan Faktur"))');
    await approveFinalModal.waitFor({ state: 'visible', timeout: 5000 });
    await approveFinalModal.locator('button[type="submit"]:has-text("Setujui & Terbitkan Invoice")').click();
    await approveFinalModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('button:has-text("Atur Pengiriman")', { timeout: 10000 });
    console.log('      ✅ 5) Approve Invoice Pelunasan via UI -> Status Order menjadi AWAITING_FINAL_PAYMENT!');

    // 5. Setup Shipment using TRANSPORT_VENDOR in UI modal (verify fix for BUYER_PICKUP enum mismatch!)
    await saPage.locator('button:has-text("Atur Pengiriman")').first().click();
    const shipModal = saPage.locator('div.fixed:has(h3:has-text("Atur Logistik Pengiriman"))');
    await shipModal.waitFor({ state: 'visible', timeout: 5000 });
    const shipMethodOpts = await shipModal.locator('select option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value)
    );
    console.log('      - Opsi Enum Metode Pengiriman di Modal UI:', shipMethodOpts);
    if (!shipMethodOpts.includes('TRANSPORT_VENDOR') || shipMethodOpts.includes('BUYER_PICKUP')) {
      auditIssues.push(`Shipment modal enum invalid: ${shipMethodOpts.join(',')}`);
    }
    await shipModal.locator('select').selectOption('TRANSPORT_VENDOR');
    await shipModal.locator('input[placeholder*="JNE-"]').fill('TRUK-UI-BENTO-01');
    await shipModal.locator('input[placeholder*="Pak Joko"]').fill('Pak Slamet');
    await shipModal.locator('input[placeholder*="B 1234"]').fill('AG 9900 BL');
    await shipModal.locator('input[placeholder*="gudang pelanggan"]').fill('Ibu Sari (Petshop Blitar)');
    await shipModal.locator('input[type="number"]').fill('125000');
    await shipModal.locator('button[type="submit"]:has-text("Simpan Pengiriman")').click();
    await shipModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('button:has-text("Ubah Pengiriman")', { timeout: 10000 });
    await saPage.waitForSelector('button:has-text("Kirim Barang")', { timeout: 10000 });
    console.log('      ✅ 6) Atur Pengiriman (TRANSPORT_VENDOR) via UI -> Tersimpan tanpa error 400!');

    // 6. Dispatch Shipment ("Kirim Barang")
    await saPage.locator('button:has-text("Kirim Barang")').first().click();
    const confirmShipModal = saPage.locator('div.fixed:has(h3:has-text("Kirim Pesanan & Terbitkan Surat Jalan"))');
    await confirmShipModal.waitFor({ state: 'visible', timeout: 5000 });
    await confirmShipModal.locator('button:has-text("Konfirmasi Kirim")').click();
    await confirmShipModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('a:has-text("Cetak Surat Jalan")', { timeout: 10000 });
    console.log('      ✅ 7) Kirim Barang via UI -> Status SHIPPED, Nomor Surat Jalan terbit, tombol "Cetak Surat Jalan" aktif!');

    // Test Cetak Surat Jalan PDF link in browser context
    const sjHref = await saPage.locator('a:has-text("Cetak Surat Jalan")').first().getAttribute('href');
    const sjPdfCheck = await saPage.evaluate(async (href: string | null) => {
      if (!href) return { status: 0, ct: null, size: 0, hdr: '' };
      const res = await fetch(href);
      const buf = await res.arrayBuffer();
      const hdr = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
      return { status: res.status, ct: res.headers.get('content-type'), size: buf.byteLength, hdr };
    }, sjHref);
    console.log('      ✅ 8) Cetak Surat Jalan PDF via Browser:', JSON.stringify(sjPdfCheck));
    if (
      sjPdfCheck.status !== 200 ||
      !sjPdfCheck.ct?.includes('application/pdf') ||
      sjPdfCheck.hdr !== '%PDF-' ||
      sjPdfCheck.size < 1000
    ) {
      auditIssues.push(`Surat Jalan PDF failed: ${JSON.stringify(sjPdfCheck)}`);
    }

    // 7. Deliver Shipment ("Tandai Diterima")
    await saPage.locator('button:has-text("Tandai Diterima")').first().click();
    const deliverModal = saPage.locator('div.fixed:has(h3:has-text("Konfirmasi Penerimaan Barang di Tujuan"))');
    await deliverModal.waitFor({ state: 'visible', timeout: 5000 });
    await deliverModal.locator('button[type="submit"]:has-text("Tandai Diterima")').click();
    await deliverModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('span:has-text("DELIVERED")', { timeout: 10000 });
    console.log('      ✅ 9) Tandai Diterima via UI -> Status Order menjadi DELIVERED!');

    // 8. Final Settlement Payment -> record PENDING first, then test manual "Verifikasi" button & modal -> COMPLETED!
    await saPage.locator('button:has-text("+ Catat Pembayaran"), button:has-text("Catat Pembayaran Masuk")').first().click();
    const finalPayModal = saPage.locator('div.fixed:has(h3:has-text("Catat Pembayaran Masuk"))');
    await finalPayModal.waitFor({ state: 'visible', timeout: 5000 });
    await finalPayModal.locator('input[placeholder*="BCA-"]').fill('UI-FINAL-BCA-002');
    await finalPayModal.locator('#autoVerifyCheck').uncheck();
    await finalPayModal.locator('button[type="submit"]:has-text("Simpan Pembayaran")').click();
    await finalPayModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('button:has-text("Verifikasi")', { timeout: 10000 });
    await saPage.locator('button:has-text("Verifikasi")').first().click();
    const verifyPayModal = saPage.locator('div.fixed:has(h3:has-text("Verifikasi Pembayaran"))');
    await verifyPayModal.waitFor({ state: 'visible', timeout: 5000 });
    await verifyPayModal.locator('button:has-text("Ya, Verifikasi")').click();
    await verifyPayModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('span:has-text("Selesai")', { timeout: 12000 });
    console.log('      ✅ 10) Pelunasan Akhir + Tombol "Verifikasi" Manual via UI -> Status Order otomatis menjadi COMPLETED (0 error HTTP 500)!');

    // 9. Credit Note Modal (+ Buat Nota Kredit -> CUSTOMER_CREDIT) & Void Nota Kredit
    await saPage.reload({ waitUntil: 'networkidle' });
    const createCnBtn = saPage.locator('button:has-text("+ Buat Nota Kredit")').first();
    await createCnBtn.waitFor({ state: 'visible', timeout: 8000 });
    await createCnBtn.click();
    const cnModal = saPage.locator('div.fixed:has(h3:has-text("Buat Nota Kredit & Retur Penjualan"))');
    await cnModal.waitFor({ state: 'visible', timeout: 5000 });
    await cnModal.locator('textarea').fill('Uji retur 1 sak rusak saat audit UI Playwright');
    await cnModal.locator('label:has-text("Deposit Pelanggan")').click();
    await cnModal.locator('input[type="number"]').first().fill('1');
    await cnModal.locator('button[type="submit"]:has-text("Terbitkan Nota Kredit")').click();
    await cnModal.waitFor({ state: 'detached', timeout: 12000 });

    const cnPdfLink = saPage.locator('a[href^="/api/v1/credit-notes/"]').first();
    await cnPdfLink.waitFor({ state: 'visible', timeout: 8000 });
    const cnPdfHref = await cnPdfLink.getAttribute('href');
    const cnId = cnPdfHref?.match(/\/credit-notes\/([^/]+)\/pdf/)?.[1] || '';
    const cnPdfChecks = await saPage.evaluate(
      async ({ href, id }: { href: string | null; id: string }) => {
        const directRes = href ? await fetch(href) : null;
        const directBuf = directRes ? await directRes.arrayBuffer() : new ArrayBuffer(0);
        const directHdr = new TextDecoder().decode(new Uint8Array(directBuf).slice(0, 5));

        const htmlRes = href ? await fetch(`${href}?format=html`) : null;
        const htmlText = htmlRes ? await htmlRes.text() : '';

        const tokRes = id
          ? await fetch('/api/v1/downloads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'CREDIT_NOTE_PDF', id }),
            })
          : null;
        const tokJson = tokRes ? await tokRes.json() : { ok: false };
        const dlRes = tokJson.ok ? await fetch(tokJson.data.url) : null;
        const dlBuf = dlRes ? await dlRes.arrayBuffer() : new ArrayBuffer(0);
        const dlHdr = new TextDecoder().decode(new Uint8Array(dlBuf).slice(0, 5));

        return {
          directStatus: directRes?.status,
          directHdr,
          directBytes: directBuf.byteLength,
          tokenStatus: dlRes?.status,
          dlHdr,
          dlBytes: dlBuf.byteLength,
          htmlHasNumber: htmlText.includes('CN/'),
          htmlLeaksHpp:
            htmlText.toLowerCase().includes('cogsreversed') ||
            htmlText.includes('HPP Dipulihkan'),
        };
      },
      { href: cnPdfHref, id: cnId }
    );
    console.log('      ✅ 11a) Cetak PDF Nota Kredit (Direct + Token CREDIT_NOTE_PDF):', JSON.stringify(cnPdfChecks));
    if (
      cnPdfChecks.directStatus !== 200 ||
      cnPdfChecks.directHdr !== '%PDF-' ||
      cnPdfChecks.directBytes < 1000 ||
      cnPdfChecks.tokenStatus !== 200 ||
      cnPdfChecks.dlHdr !== '%PDF-' ||
      cnPdfChecks.dlBytes < 1000 ||
      !cnPdfChecks.htmlHasNumber ||
      cnPdfChecks.htmlLeaksHpp
    ) {
      auditIssues.push(`Credit Note PDF check failed: ${JSON.stringify(cnPdfChecks)}`);
    }

    // Bi-directional Sales verification on COMPLETED Order + Credit Note (zero HPP/profit/commission leakage)
    await salesPage.goto(createdOrderUrl, { waitUntil: 'networkidle' });
    await salesPage.waitForSelector('span:has-text("Selesai")', { timeout: 10000 });
    const salesCompletedBody = await salesPage.locator('body').innerText();
    const leakedAdminTerms = [
      'Laba Riil',
      'HPP Dipulihkan',
      'Tandai Komisi Sudah Dibayar',
      'Setujui Pesanan',
      'Void Nota Kredit',
    ].filter((term) => salesCompletedBody.includes(term));
    if (leakedAdminTerms.length > 0) {
      auditIssues.push(`Sales COMPLETED order leaks admin/profit UI: ${leakedAdminTerms.join(', ')}`);
    }
    const salesSjHref = await salesPage.locator('a:has-text("Cetak Surat Jalan")').first().getAttribute('href');
    const salesFinalInvHref = await salesPage.locator('a[href^="/api/v1/invoices/"]').last().getAttribute('href');
    const salesCnHref = await salesPage.locator('a[href^="/api/v1/credit-notes/"]').first().getAttribute('href');
    for (const [docLabel, href] of [
      ['Sales Surat Jalan PDF', salesSjHref],
      ['Sales Final Invoice PDF', salesFinalInvHref],
      ['Sales Credit Note PDF', salesCnHref],
    ] as const) {
      const check = await fetchPdfMeta(salesPage, href);
      if (check.status !== 200 || !check.ct?.includes('application/pdf') || check.hdr !== '%PDF-' || check.size < 1000) {
        auditIssues.push(`${docLabel} failed: ${JSON.stringify(check)}`);
      }
    }
    console.log('      ✅ 11b) Bi-directional Sales UI check (Order Selesai, SJ/Invoice/Credit Note PDF, 0 kebocoran profit/HPP/komisi) LULUS!');

    const voidCnBtn = saPage.locator('button[title="Batalkan Nota Kredit Ini"]').first();
    await voidCnBtn.waitFor({ state: 'visible', timeout: 8000 });
    await voidCnBtn.click();
    const voidCnModal = saPage.locator('div.fixed:has(h3:has-text("Batalkan (Void) Nota Kredit"))');
    await voidCnModal.waitFor({ state: 'visible', timeout: 5000 });
    await voidCnModal.locator('textarea').fill('Pembatalan retur uji audit UI Playwright');
    await voidCnModal.locator('button[type="submit"]:has-text("Konfirmasi Void")').click();
    await voidCnModal.waitFor({ state: 'detached', timeout: 12000 });
    await saPage.waitForSelector('text=DIBATALKAN (VOID)', { timeout: 8000 });
    console.log('      ✅ 11) Modal "+ Buat Nota Kredit" (CUSTOMER_CREDIT) + "Void" Nota Kredit via UI -> Terbit & dipulihkan kembali!');

    // 10. Commission Pay UI ("Tandai Komisi Sudah Dibayar") on COMPLETED order
    await saPage.reload({ waitUntil: 'networkidle' });
    const payCommBtn = saPage.locator('button:has-text("Tandai Komisi Sudah Dibayar")');
    await saPage.waitForTimeout(500);
    if ((await payCommBtn.count()) > 0) {
      await payCommBtn.first().click();
      const payCommModal = saPage.locator('div.fixed:has(h3:has-text("Tandai Komisi Dibayar"))');
      await payCommModal.waitFor({ state: 'visible', timeout: 5000 });
      await payCommModal.locator('textarea').fill('Komisi dibayar via uji UI Playwright');
      await payCommModal.locator('button[type="submit"]:has-text("Konfirmasi Bayar")').click();
      await payCommModal.waitFor({ state: 'detached', timeout: 12000 });
      await saPage.waitForSelector('text=Komisi berhasil ditandai telah dibayarkan', { timeout: 8000 });
      console.log('      ✅ 12) Tombol "Tandai Komisi Sudah Dibayar" via UI -> Komisi terkunci PAID!');
    } else {
      console.log('      ℹ️ 12) Komisi order #1 tidak berstatus EARNED (kemungkinan mode/rate belum aktif atau sudah PAID).');
    }

    // 11. Full Revision / Edit / Withdraw / Delete Draft Loop (Order #2)
    console.log('\n   🔁 Uji Siklus Penolakan -> Revisi (/edit) -> Tarik Pengajuan -> Hapus Draf:');
    const revSalesCtx = await browser.newContext();
    const revSalesPage = await revSalesCtx.newPage();
    revSalesPage.on('pageerror', (e: Error) => saRuntimeErrors.push(`RevSalesPageError: ${e.message}`));
    revSalesPage.on('response', (res: Response) => {
      if (res.status() >= 500) {
        saRuntimeErrors.push(`RevSales HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
      }
    });

    await loginViaUI(revSalesPage, salesUsername, salesPassword);
    await revSalesPage.goto('http://localhost:3000/orders/new', { waitUntil: 'networkidle' });
    await revSalesPage.locator('select').first().waitFor({ state: 'visible', timeout: 8000 });
    await revSalesPage.locator('select').first().selectOption({ index: 1 });
    await revSalesPage.locator('button:has-text("Tambah Produk")').first().click();
    await revSalesPage.locator('select').nth(1).waitFor({ state: 'visible', timeout: 5000 });
    await revSalesPage.locator('select').nth(1).selectOption({ index: 1 });
    await revSalesPage.locator('input[type="number"]').first().fill('10');
    await revSalesPage.waitForTimeout(900);
    const revBelowMin = revSalesPage.locator('textarea[placeholder*="order partai besar"]');
    if (await revBelowMin.isVisible()) {
      await revBelowMin.fill('Order uji siklus revisi dan tarik pengajuan Playwright');
    }
    await revSalesPage.click('button:has-text("Simpan Draf Pesanan")');
    await revSalesPage.waitForSelector('button:has-text("Ya, Simpan Pesanan")', { timeout: 8000 });
    await revSalesPage.click('button:has-text("Ya, Simpan Pesanan")');
    await revSalesPage.waitForURL(/\/orders\/(?!new$)[a-z0-9_-]+$/i, { waitUntil: 'commit', timeout: 15000 });
    const revOrderUrl = revSalesPage.url();
    const revOrderId = revOrderUrl.split('/').pop()!;
    await revSalesPage.waitForLoadState('networkidle');

    // Submit by Sales
    await revSalesPage.locator('button:has-text("Ajukan Pesanan")').first().click();
    await revSalesPage.waitForSelector('div.fixed h3:has-text("Ajukan Pesanan untuk Persetujuan")', { timeout: 5000 });
    await revSalesPage.locator('div.fixed button[type="submit"]:has-text("Ajukan Pesanan")').click();
    await revSalesPage.waitForSelector('button:has-text("Tarik Pengajuan")', { timeout: 10000 });

    // SuperAdmin Rejects ("Tolak / Revisi") -> REVISION_REQUIRED
    await saPage.goto(revOrderUrl, { waitUntil: 'networkidle' });
    await saPage.locator('button:has-text("Tolak / Revisi")').first().click();
    const rejectModal = saPage.locator('div.fixed:has(h3:has-text("Tolak Pengajuan & Minta Revisi"))');
    await rejectModal.waitFor({ state: 'visible', timeout: 5000 });
    await rejectModal.locator('textarea').fill('Mohon sesuaikan kuantitas minimal 12 sak sesuai ketentuan revisi');
    await rejectModal.locator('button[type="submit"]:has-text("Kirim Penolakan")').click();
    await rejectModal.waitFor({ state: 'detached', timeout: 10000 });
    await saPage.waitForSelector('span:has-text("Perlu Revisi")', { timeout: 10000 });

    // Sales Sees Rejection Reason -> Opens Edit Draft (/orders/[id]/edit) -> Updates Qty -> Resubmits -> Withdraws ("Tarik Pengajuan")
    await revSalesPage.reload({ waitUntil: 'networkidle' });
    await revSalesPage.waitForSelector(
      'text=Mohon sesuaikan kuantitas minimal 12 sak sesuai ketentuan revisi',
      { timeout: 8000 }
    );
    await revSalesPage.locator('a:has-text("Edit Draf")').first().click();
    await revSalesPage.waitForURL(new RegExp(`/orders/${revOrderId}/edit$`), { timeout: 10000 });
    await revSalesPage.waitForSelector('text=Perhatian: Pesanan Memerlukan Revisi', { timeout: 8000 });
    await revSalesPage.locator('input[type="number"]').first().fill('12');
    await revSalesPage.waitForTimeout(900);
    if (await revBelowMin.isVisible() && (await revBelowMin.inputValue()).trim().length < 5) {
      await revBelowMin.fill('Harga & kuantitas sudah disesuaikan ulang sesuai arahan SuperAdmin');
    }
    await revSalesPage.click('button:has-text("Simpan Perubahan")');
    await revSalesPage.waitForSelector('button:has-text("Ya, Simpan Pesanan")', { timeout: 8000 });
    await revSalesPage.click('button:has-text("Ya, Simpan Pesanan")');
    await revSalesPage.waitForURL(new RegExp(`/orders/${revOrderId}$`), { timeout: 12000 });
    await revSalesPage.waitForLoadState('networkidle');

    // Resubmit then Withdraw back to DRAFT
    await revSalesPage.locator('button:has-text("Ajukan Pesanan")').first().click();
    const resubmitModal = revSalesPage.locator('div.fixed:has(h3:has-text("Ajukan Pesanan untuk Persetujuan"))');
    await resubmitModal.waitFor({ state: 'visible', timeout: 5000 });
    await resubmitModal.locator('button[type="submit"]:has-text("Ajukan Pesanan")').click();
    await resubmitModal.waitFor({ state: 'detached', timeout: 10000 });
    await revSalesPage.waitForSelector('button:has-text("Tarik Pengajuan")', { timeout: 10000 });
    await revSalesPage.locator('button:has-text("Tarik Pengajuan")').first().click();
    const withdrawModal = revSalesPage.locator('div.fixed:has(h3:has-text("Tarik Pengajuan Pesanan"))');
    await withdrawModal.waitFor({ state: 'visible', timeout: 5000 });
    await withdrawModal.locator('button:has-text("Ya, Tarik ke Draf")').click();
    await withdrawModal.waitFor({ state: 'detached', timeout: 10000 });
    await revSalesPage.waitForSelector('button:has-text("Ajukan Pesanan")', { timeout: 10000 });
    await revSalesCtx.close();

    // SuperAdmin Deletes Draft via ConfirmTypeDialog ("Hapus Draf") for clean state
    await saPage.reload({ waitUntil: 'networkidle' });
    await saPage.locator('button:has-text("Hapus Draf")').first().click();
    const delModal = saPage.locator('div.fixed:has(h3:has-text("Hapus Pesanan Penjualan"))');
    await delModal.waitFor({ state: 'visible', timeout: 5000 });
    const confirmTargetText = (await delModal.locator('p.select-all').innerText()).trim();
    await delModal.locator('input[type="text"]').fill(confirmTargetText);
    await delModal.locator('button:has-text("Hapus Pesanan")').click();
    await saPage.waitForURL(/\/orders$/, { timeout: 12000 });
    console.log('      ✅ 13) Siklus Penolakan -> Revisi (/edit) -> Ajukan Ulang -> Tarik Pengajuan -> Hapus Draf (ConfirmTypeDialog) LULUS!');

    // 12. Catalog Create + PDF Download + Token CATALOG_PDF + Delete Cleanup
    console.log('\n   📚 Uji Katalog Harga Baru, Unduh PDF, Token CATALOG_PDF, & Hapus:');
    await saPage.goto('http://localhost:3000/catalogs/new', { waitUntil: 'networkidle' });
    await saPage.locator('input[placeholder*="Contoh: Grosir"]').fill('Katalog Audit Playwright E2E');
    const addAllBtn = saPage.locator('button:has-text("+ Tambah Semua Produk")');
    if ((await addAllBtn.count()) > 0) {
      await addAllBtn.first().click();
    }
    const catNewText = await saPage.locator('body').innerText();
    if (catNewText.includes('Rp Rp')) {
      auditIssues.push('Duplicate Rp Rp found on /catalogs/new');
    }
    await saPage.locator('button[type="submit"]:has-text("Simpan Katalog")').click();
    await saPage.waitForURL(/\/catalogs\/(?!new$)[a-z0-9_-]+$/i, { timeout: 12000 });
    await saPage.waitForLoadState('networkidle');
    const catalogId = saPage.url().split('/').pop()!;
    const catDetailText = await saPage.locator('body').innerText();
    if (catDetailText.includes('Rp Rp')) {
      auditIssues.push(`Duplicate Rp Rp found on /catalogs/${catalogId}`);
    }
    const catPdfCheck = await saPage.evaluate(async (id: string) => {
      const res = await fetch(`/api/v1/catalogs/${id}/pdf`);
      const buf = await res.arrayBuffer();
      const hdr = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
      const dlRes = await fetch('/api/v1/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CATALOG_PDF', id }),
      });
      const dlJson = await dlRes.json().catch(() => null);
      let tokCheck = { status: 0, ct: null as string | null, hdr: '', size: 0 };
      if (dlRes.ok && dlJson?.data?.url) {
        const tRes = await fetch(dlJson.data.url);
        const tBuf = await tRes.arrayBuffer();
        tokCheck = {
          status: tRes.status,
          ct: tRes.headers.get('content-type'),
          hdr: new TextDecoder().decode(new Uint8Array(tBuf).slice(0, 5)),
          size: tBuf.byteLength,
        };
      }
      return {
        direct: { status: res.status, ct: res.headers.get('content-type'), size: buf.byteLength, hdr },
        tokResStatus: dlRes.status,
        tokCheck,
      };
    }, catalogId);
    console.log('      - Katalog PDF & Token /api/v1/dl/[token] Check:', JSON.stringify(catPdfCheck));
    if (
      catPdfCheck.direct.status !== 200 ||
      !catPdfCheck.direct.ct?.includes('application/pdf') ||
      catPdfCheck.direct.hdr !== '%PDF-' ||
      catPdfCheck.tokCheck.status !== 200 ||
      !catPdfCheck.tokCheck.ct?.includes('application/pdf') ||
      catPdfCheck.tokCheck.hdr !== '%PDF-'
    ) {
      auditIssues.push(`Catalog PDF or token download failed: ${JSON.stringify(catPdfCheck)}`);
    }
    saPage.once('dialog', (dlg) => dlg.accept());
    await saPage.locator('button:has-text("Hapus Katalog Ini")').click();
    await saPage.waitForURL(/\/catalogs$/, { timeout: 10000 });
    console.log('      ✅ 14) Katalog Baru -> PDF Langsung -> Token CATALOG_PDF /api/v1/dl/[token] -> Hapus Katalog LULUS!');

    // 13. Purchase Order Full UI Lifecycle (DRAFT -> ORDERED -> RECEIVED -> PAID)
    console.log('\n   🏭 Uji Siklus Lengkap Purchase Order (/purchase-orders/new -> Diterima -> Lunas):');
    await saPage.goto('http://localhost:3000/purchase-orders/new', { waitUntil: 'networkidle' });
    const poVendorOpts = await saPage.locator('select').nth(0).locator('option').count();
    const poProdOpts = await saPage.locator('select').nth(1).locator('option').count();
    if (poVendorOpts > 1 && poProdOpts > 1) {
      await saPage.locator('select').nth(0).selectOption({ index: 1 });
      await saPage.locator('select').nth(1).selectOption({ index: 1 });
      await saPage.locator('input[type="number"]').first().fill('1');
      await saPage.locator('button[type="submit"]:has-text("Simpan Draf PO")').click();
      await saPage.waitForURL(/\/purchase-orders\/(?!new$)[a-z0-9_-]+$/i, { timeout: 12000 });
      await saPage.waitForLoadState('networkidle');

      // DRAFT -> ORDERED
      await saPage.locator('button:has-text("Pesan Sekarang")').click();
      await saPage.waitForSelector('div.fixed button:has-text("Ya, Terbitkan PO")', { timeout: 5000 });
      await saPage.locator('div.fixed button:has-text("Ya, Terbitkan PO")').click();
      await saPage.waitForSelector('button:has-text("Terima Barang")', { timeout: 10000 });

      // ORDERED -> RECEIVED
      await saPage.locator('button:has-text("Terima Barang")').click();
      await saPage.waitForSelector('div.fixed button[type="submit"]:has-text("Simpan Penerimaan")', { timeout: 5000 });
      await saPage.locator('div.fixed input[placeholder*="Surat Jalan"]').fill('SJ-AUDIT-UI-PW-01');
      await saPage.locator('div.fixed button[type="submit"]:has-text("Simpan Penerimaan")').click();
      await saPage.locator('div.fixed button[type="submit"]:has-text("Simpan Penerimaan")').waitFor({ state: 'detached', timeout: 10000 });

      // Record Vendor Payment
      await saPage.locator('button:has-text("Catat Bayar Vendor")').click();
      await saPage.waitForSelector('div.fixed button[type="submit"]:has-text("Simpan Pembayaran")', { timeout: 5000 });
      await saPage.locator('div.fixed input[placeholder*="TRF-"]').fill('TRF-PW-PO-01');
      await saPage.locator('div.fixed button[type="submit"]:has-text("Simpan Pembayaran")').click();
      await saPage.locator('div.fixed button[type="submit"]:has-text("Simpan Pembayaran")').waitFor({ state: 'detached', timeout: 10000 });
      console.log('      ✅ 15) Purchase Order UI Lifecycle (Buat Draf -> Terbitkan PO -> Terima Barang -> Bayar Vendor) LULUS!');
    } else {
      console.log(`      ⚠️ 15) Skip PO UI (vendorOpts=${poVendorOpts}, prodOpts=${poProdOpts})`);
    }

    // Inspect historical imported BentoCat data pages
    console.log('\n   📂 Uji Data Historis Hasil Import BENTOCAT.zip & Modul Admin Lainnya di UI:');
    await saPage.goto('http://localhost:3000/customers', { waitUntil: 'networkidle' });
    const custCount = await saPage.locator('table tbody tr, a[href^="/customers/"]').count();
    console.log(`      - /customers: tampil ${custCount} elemen toko BentoCat`);

    // Open first customer detail & test bi-directional Sales -> SuperAdmin CRM Interaction + /sales/[id] evaluation
    const firstCustHref = await saPage.locator('a[href^="/customers/"]').first().getAttribute('href');
    if (firstCustHref) {
      const crmNoteText = 'Follow up uji sinkronisasi Sales ke SuperAdmin Playwright';
      await salesPage.goto(`http://localhost:3000${firstCustHref}`, { waitUntil: 'networkidle' });
      await salesPage.locator('button:has-text("Catat Interaksi")').first().click();
      const crmModal = salesPage.locator('div.fixed:has(h2:has-text("Catat Interaksi CRM"))');
      await crmModal.waitFor({ state: 'visible', timeout: 5000 });
      const waBtn = crmModal.locator('button:has-text("WhatsApp")').first();
      if ((await waBtn.count()) > 0) await waBtn.click();
      await crmModal.locator('textarea').fill(crmNoteText);
      await crmModal.locator('button[type="submit"]:has-text("Simpan Catatan")').click();
      await crmModal.waitFor({ state: 'detached', timeout: 10000 });
      await salesPage.waitForSelector(`text=${crmNoteText}`, { timeout: 10000 });

      const custRes = await saPage.goto(`http://localhost:3000${firstCustHref}`, { waitUntil: 'networkidle' });
      await saPage.waitForSelector(`text=${crmNoteText}`, { timeout: 10000 });
      console.log(`      - ${firstCustHref}: HTTP ${custRes?.status()}, CRM Sales ("Catat Interaksi") sinkron tampil di SuperAdmin ✅`);
    } else {
      auditIssues.push('No customer link found on /customers');
    }

    await salesContext.close();

    // Cross-check /reports/crm and /sales -> /sales/[id]
    await saPage.goto('http://localhost:3000/reports/crm', { waitUntil: 'networkidle' });
    const crmReportText = await saPage.locator('body').innerText();
    if (crmReportText.includes('Rp Rp')) auditIssues.push('Duplicate Rp Rp on /reports/crm');
    console.log(`      - /reports/crm (SuperAdmin): sinkron (${crmReportText.length} karakter) ✅`);

    await saPage.goto('http://localhost:3000/sales', { waitUntil: 'networkidle' });
    const salesEvalDetailHref = await saPage.locator('a[href^="/sales/"]').first().getAttribute('href');
    if (salesEvalDetailHref) {
      const sDetRes = await saPage.goto(`http://localhost:3000${salesEvalDetailHref}`, { waitUntil: 'networkidle' });
      const sDetText = await saPage.locator('body').innerText();
      if (sDetRes?.status() !== 200 || sDetText.includes('Rp Rp')) {
        auditIssues.push(`/sales/[id] failed: status=${sDetRes?.status()}`);
      }
      console.log(`      - ${salesEvalDetailHref}: Evaluasi & Komisi Sales termuat (HTTP ${sDetRes?.status()}) ✅`);
    } else {
      auditIssues.push('No /sales/[id] link found on /sales evaluation table');
    }

    await saPage.goto('http://localhost:3000/products', { waitUntil: 'networkidle' });
    const prodText = await saPage.locator('body').innerText();
    console.log(`      - /products: memuat SKU BentoCat? ${prodText.includes('BentoCat') ? '✅ YA' : '❌ TIDAK'}`);

    await saPage.goto('http://localhost:3000/catalogs', { waitUntil: 'networkidle' });
    const catText = await saPage.locator('body').innerText();
    console.log(`      - /catalogs: memuat halaman Katalog? ${catText.includes('Katalog') ? '✅ YA' : '❌ TIDAK'}`);

    await saPage.goto('http://localhost:3000/purchase-orders', { waitUntil: 'networkidle' });
    const poText = await saPage.locator('body').innerText();
    console.log(`      - /purchase-orders: memuat PO impor? ${poText.includes('PO') || poText.includes('Pabrik') || poText.includes('CV') ? '✅ YA' : '⚠️ Cek'}`);

    await saPage.goto('http://localhost:3000/stock', { waitUntil: 'networkidle' });
    const stockText = await saPage.locator('body').innerText();
    console.log(`      - /stock: menampilkan stok produk BentoCat? ${stockText.includes('BentoCat') ? '✅ YA' : '❌ TIDAK'}`);

    await saPage.goto('http://localhost:3000/settings/business', { waitUntil: 'networkidle' });
    const bizText = await saPage.locator('body').innerText();
    const hasTiers = bizText.includes('Tingkat Komisi Berjenjang');
    console.log(`      - /settings/business: memuat CV BentoCat Mandiri? ${bizText.includes('BentoCat') ? '✅ YA' : '❌ TIDAK'}, Tiers UI=${hasTiers ? '✅ YA' : '❌ TIDAK'}`);
    if (!hasTiers) auditIssues.push('Commission Tiers UI missing on /settings/business');

    // DataTransferCard Dry-Run (Simulasi Impor ZIP) via UI
    const dryRunZipPath = path.join(process.cwd(), 'exports', 'omnicat-export-business-BENTOCAT.zip');
    if (fs.existsSync(dryRunZipPath)) {
      const zipInput = saPage.locator('input[type="file"][accept=".zip"]').first();
      await zipInput.setInputFiles(dryRunZipPath);
      const dryRunBtn = saPage.locator('button:has-text("Periksa Dulu (Simulasi)")').first();
      await dryRunBtn.waitFor({ state: 'visible', timeout: 5000 });

      // Mode standar tanpa overwrite harus mendeteksi konflik BENTOCAT yg sudah ada
      await dryRunBtn.click();
      await saPage.waitForSelector('text=Pemeriksaan Gagal', { timeout: 15000 });

      // Mode timpa (#overwrite-business) harus lulus simulasi dry-run penuh
      await saPage.locator('#overwrite-business').check();
      await dryRunBtn.click();
      await saPage.waitForSelector('text=Pemeriksaan Lulus (Siap Diimpor)', { timeout: 15000 });
      console.log('      - DataTransferCard Dry-Run (konflik non-overwrite + #overwrite-business): ✅ Pemeriksaan Lulus (Siap Diimpor)');
    } else {
      auditIssues.push(`Dry-run ZIP not found at ${dryRunZipPath}`);
    }

    for (const extraAdminRoute of ['/reports', '/reports/margin', '/audit', '/settings/users']) {
      await saPage.goto(`http://localhost:3000${extraAdminRoute}`, { waitUntil: 'networkidle' });
      const txt = await saPage.locator('body').innerText();
      if (txt.includes('Rp Rp')) auditIssues.push(`Duplicate Rp Rp on ${extraAdminRoute}`);
      console.log(`      - ${extraAdminRoute}: ter-render bersih (${txt.length} karakter), bebas "Rp Rp": ✅`);
    }

    // Export ZIP check via authenticated SuperAdmin browser context
    const exportCheck = await saPage.evaluate(async () => {
      const res = await fetch('/api/v1/businesses/biz_bentocat_blitar_01/export');
      const buf = await res.arrayBuffer();
      const magic = new TextDecoder().decode(new Uint8Array(buf).slice(0, 2));
      return { status: res.status, ct: res.headers.get('content-type'), size: buf.byteLength, magic };
    });
    console.log('      - GET /api/v1/businesses/biz_bentocat_blitar_01/export:', JSON.stringify(exportCheck));
    if (exportCheck.status !== 200 || exportCheck.magic !== 'PK' || exportCheck.size < 1000) {
      auditIssues.push(`Export ZIP failed: ${JSON.stringify(exportCheck)}`);
    }

    // Telegram Mini App (/tg, /tg/approvals/[id], /tg/payments redirect) check
    const tgRes = await saPage.goto('http://localhost:3000/tg', { waitUntil: 'networkidle' });
    const tgBody = await saPage.locator('body').innerText();
    console.log(`      - /tg (Telegram Mini App): HTTP ${tgRes?.status()}, render OK (${tgBody.length} karakter)`);
    if (tgRes?.status() !== 200) {
      auditIssues.push(`/tg returned HTTP ${tgRes?.status()}`);
    }

    const tgTargetInvId = dpInvId || pendingInvId;
    if (tgTargetInvId) {
      const tgAppRes = await saPage.goto(`http://localhost:3000/tg/approvals/${tgTargetInvId}`, {
        waitUntil: 'networkidle',
      });
      console.log(`      - /tg/approvals/${tgTargetInvId}: HTTP ${tgAppRes?.status()}`);
      if (tgAppRes?.status() !== 200) {
        auditIssues.push(`/tg/approvals/${tgTargetInvId} returned HTTP ${tgAppRes?.status()}`);
      }
    }

    const tgPayRes = await saPage.goto('http://localhost:3000/tg/payments', {
      waitUntil: 'networkidle',
    });
    const tgPayUrl = saPage.url();
    console.log(`      - /tg/payments redirect -> ${tgPayUrl} (HTTP ${tgPayRes?.status()})`);
    if (tgPayRes?.status() !== 200 || !tgPayUrl.includes('/tg?redirect=/payments')) {
      auditIssues.push(`/tg/payments unexpected redirect/status: ${tgPayRes?.status()} -> ${tgPayUrl}`);
    }

    const saRoutes = [
      '/dashboard',
      '/approvals',
      '/orders',
      '/invoices',
      '/payments',
      '/receivables',
      '/customers',
      '/catalogs',
      '/products',
      '/purchase-orders',
      '/stock',
      '/vendors',
      '/sales',
      '/reminders',
      '/reports',
      '/reports/crm',
      '/reports/margin',
      '/audit',
      '/updates',
      '/settings/business',
      '/settings/users',
      '/profile',
    ];
    const saCrawl = await crawlRoutes(saContext, saRoutes, 'ADMIN');
    for (const r of saCrawl) {
      if (r.status !== 200 || r.consoleErrors.length || r.pageErrors.length || r.failedApiCalls.length) {
        auditIssues.push(`ADMIN ${r.route}: status=${r.status}, err=${r.consoleErrors.length + r.pageErrors.length + r.failedApiCalls.length}`);
      }
      if (r.hasHorizontalOverflowDesktop || r.hasHorizontalOverflowMobile) {
        auditIssues.push(`ADMIN ${r.route} overflow: desk=${r.hasHorizontalOverflowDesktop}, mob=${r.hasHorizontalOverflowMobile}`);
      }
    }

    if (salesRuntimeErrors.length > 0) {
      console.log('   ❌ Runtime Errors during Sales interaction:', salesRuntimeErrors);
      auditIssues.push(...salesRuntimeErrors);
    }

    if (saRuntimeErrors.length > 0) {
      console.log('   ❌ Runtime Errors during SuperAdmin interaction:', saRuntimeErrors);
      auditIssues.push(...saRuntimeErrors);
    }

    await saContext.close();
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  if (auditIssues.length === 0) {
    console.log('🏁 PLAYWRIGHT UI & BUTTON AUDIT SELESAI — SEMUA LOLOS (0 TEMUAN GAGAL)');
  } else {
    console.log('⚠️ PLAYWRIGHT UI AUDIT SELESAI DENGAN TEMUAN:', auditIssues);
    process.exitCode = 1;
  }
  console.log('================================================================');
}

runPlaywrightAudit().catch((err) => {
  console.error('❌ FATAL ERROR IN PLAYWRIGHT AUDIT:', err);
  process.exit(1);
});
