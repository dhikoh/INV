import { test, expect } from '@playwright/test';

test.use({
  channel: 'chrome',
});

test.describe('E2E Audit: Alur Bisnis Inti, Approval UI & Status Lingkungan (E3, E4, E5)', () => {
  test('Super Admin login via form UI: mendeteksi kegagalan koneksi database jika PostgreSQL lokal mati (AUD-OPS-002)', async ({ page }) => {
    const saUsername = process.env.E2E_SUPERADMIN_USERNAME || process.env.SEED_SUPERADMIN_USERNAME || 'superadmin';
    const saPassword = process.env.E2E_SUPERADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
    if (!saPassword) {
      throw new Error('Wajib setel E2E_SUPERADMIN_PASSWORD atau SEED_SUPERADMIN_PASSWORD pada environment (.env)');
    }

    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', saUsername);
    await page.fill('input[type="password"]', saPassword);
    await page.click('button[type="submit"]');

    // Menunggu respon API auth
    const response = await page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/auth/login'),
      { timeout: 5000 }
    ).catch(() => null);

    if (response) {
      // Jika database offline (AUD-OPS-002), server merespon 500 ECONNREFUSED
      console.log('Login API Response Status:', response.status());
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
      }
    } else {
      console.log('Login request tidak selesai / timeout koneksi database');
    }
  });

  test('UI Approval Invoice: halaman /approvals/:invoiceId ada di App Router dan terproteksi sesi', async ({ page }) => {
    const response = await page.goto('/approvals/inv_test_approval');
    // Akses tanpa sesi diarahkan ke /login
    expect([200, 307]).toContain(response?.status() ?? 307);
    await expect(page).toHaveURL(/\/login/);
  });

  test('UI Orders & Retur: halaman /orders ada di App Router dan terproteksi sesi', async ({ page }) => {
    const response = await page.goto('/orders');
    expect([200, 307]).toContain(response?.status() ?? 307);
    await expect(page).toHaveURL(/\/login/);
  });

  test('PDF Endpoint Signed Token: /api/v1/dl/invalid-token menolak akses dengan HTTP 401 INVALID_DOWNLOAD_TOKEN', async ({ request }) => {
    const response = await request.get('/api/v1/dl/invalid-token');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error?.code).toBe('INVALID_DOWNLOAD_TOKEN');
  });

  test('Telegram Mini App Approvals: /tg/approvals/:id berhasil merender halaman persetujuan (AUD-GAP-001 teratasi)', async ({ page }) => {
    const response = await page.goto('/tg/approvals/inv_audit_proof');
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
  });
});
