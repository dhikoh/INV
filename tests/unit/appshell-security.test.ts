import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-003, NAV-006 & NAV-009: Keamanan Navigasi & Integritas Multi-Tenant di AppShell', () => {
  const appShellPath = path.resolve(__dirname, '../../src/components/AppShell.tsx');

  it('memastikan pengalih usaha menggunakan window.location.reload() agar komponen klien me-render ulang data baru (NAV-003)', () => {
    expect(fs.existsSync(appShellPath)).toBe(true);
    const content = fs.readFileSync(appShellPath, 'utf8');

    // handleSwitchBusiness wajib me-reload halaman agar state client component tidak basi
    expect(content).toContain('window.location.reload()');
  });

  it('memastikan AppShell memiliki guard rute terpusat untuk membatasi akses Sales ke halaman khusus Super Admin (NAV-006)', () => {
    const content = fs.readFileSync(appShellPath, 'utf8');

    // Harus mendefinisikan prefix rute khusus Super Admin dan memeriksa role Sales
    expect(content).toContain('SUPERADMIN_ONLY_PREFIXES');
    expect(content).toContain('/approvals');
    expect(content).toContain('/stock');
    expect(content).toContain('/purchase-orders');
    expect(content).toContain('/payments');
    expect(content).toContain('/audit');
    expect(content).toContain('Akses Dibatasi');
  });

  it('memastikan pengguna dengan mustChangePassword dialihkan paksa ke /profile (NAV-009)', () => {
    const content = fs.readFileSync(appShellPath, 'utf8');

    // Otomatis arahkan ke /profile jika mustChangePassword bernilai true
    expect(content).toContain("pathname !== '/profile'");
    expect(content).toContain("router.replace('/profile')");
  });
});
