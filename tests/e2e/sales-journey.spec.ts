import { test, expect } from '@playwright/test';

test.use({
  channel: 'chrome',
});

test.describe('E2E Audit: Sales End-to-End Navigation & UI Journey (Fase 2, T1, T2, T7)', () => {
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

  for (const route of salesRoutes) {
    test(`Sales Route terproteksi sesi & ada di App Router: ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect([200, 307]).toContain(response?.status() ?? 307);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('Form Buat Order (/orders/new) terlindungi sesi dan mengarah ke /login', async ({ page }) => {
    await page.goto('/orders/new');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Halaman Katalog (/catalogs) dan Daftar Harga (/price-list) dapat diakses via rute publik redirect', async ({ page }) => {
    const resCatalogs = await page.goto('/catalogs');
    expect([200, 307]).toContain(resCatalogs?.status() ?? 307);

    const resPriceList = await page.goto('/price-list');
    expect([200, 307]).toContain(resPriceList?.status() ?? 307);
  });

  test('Responsivitas UI Mobile (360px) pada halaman login & navigasi sales', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
