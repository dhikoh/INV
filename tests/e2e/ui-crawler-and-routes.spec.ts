import { test, expect } from '@playwright/test';

test.use({
  channel: 'chrome',
});

test.describe('E2E Audit: Crawler Seluruh Rute UI (Desktop & 360px Viewport)', () => {
  const publicRoutes = ['/login', '/offline', '/manifest.webmanifest'];

  for (const route of publicRoutes) {
    test(`akses publik: ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBeLessThan(400);
    });
  }

  const protectedRoutes = [
    '/dashboard',
    '/products',
    '/customers',
    '/orders',
    '/invoices',
    '/payments',
    '/stock',
    '/catalogs',
    '/purchase-orders',
    '/reports',
    '/reports/margin',
    '/reports/crm',
    '/sales',
    '/reminders',
    '/receivables',
    '/updates',
    '/audit',
    '/profile',
    '/settings/business',
    '/settings/users',
  ];

  for (const route of protectedRoutes) {
    test(`rute terproteksi tanpa login diarahkan ke /login: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('verifikasi rute Telegram bot & Mini App tidak lagi 404 (AUD-GAP-001 teratasi)', async ({ page }) => {
    // AUD-GAP-001: Rute persetujuan faktur dan pembayaran Telegram Mini App
    const r1 = await page.goto('/tg/approvals/inv_audit_test_123');
    expect(r1?.status()).toBe(200);

    const r2 = await page.goto('/tg/approvals/inv_audit_test_123?reject=1');
    expect(r2?.status()).toBe(200);

    const r3 = await page.goto('/tg/payments');
    expect([200, 307, 308]).toContain(r3?.status() || 0);
  });

  test('verifikasi responsivitas mobile 360 px pada seluruh layout publik', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    for (const route of publicRoutes) {
      if (route.endsWith('.webmanifest')) continue;
      await page.goto(route);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    }
  });
});

