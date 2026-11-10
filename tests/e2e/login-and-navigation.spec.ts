import { test, expect } from '@playwright/test';

test.use({
  channel: 'chrome',
});

test.describe('E2E Audit: Login & Halaman Publik', () => {
  test('halaman login dapat dibuka di viewport desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);

    // Verifikasi elemen form login
    await expect(page.locator('input[type="text"], input[name="username"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('halaman login responsif pada viewport seluler 360 px (Seksi 17.5 & A13)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);

    // Pastikan tidak ada horizontal scroll overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('halaman offline fallback PWA dapat diakses (Seksi 17.5)', async ({ page }) => {
    const response = await page.goto('/offline');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Anda Sedang Offline' })).toBeVisible();
  });

  test('akses langsung ke rute terlindungi tanpa login diarahkan ke /login', async ({ page }) => {
    await page.goto('/dashboard');
    // Client redirect ke /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('verifikasi rute Telegram Mini App berhasil dibuka dengan status 200 (AUD-GAP-001)', async ({ page }) => {
    const response = await page.goto('/tg/approvals/inv_dummy_123');
    expect(response?.status()).toBe(200);
  });
});
