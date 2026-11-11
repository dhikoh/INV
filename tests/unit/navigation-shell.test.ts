import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-002 & NAV-008: Audit Navigasi AppShell (Drawer Mobile & Integrasi Peran)', () => {
  const appShellPath = path.resolve(__dirname, '../../src/components/AppShell.tsx');

  it('memastikan drawer navigasi mobile tidak dibatasi hanya untuk isSuperAdmin (NAV-002)', () => {
    expect(fs.existsSync(appShellPath)).toBe(true);
    const content = fs.readFileSync(appShellPath, 'utf8');

    // Drawer mobile harus terbuka untuk semua role ketika sidebarOpen bernilai true
    const hasRestrictedDrawerGuard = content.includes('isSuperAdmin && sidebarOpen &&');
    expect(
      hasRestrictedDrawerGuard,
      'Drawer mobile terkunci oleh isSuperAdmin && sidebarOpen && (seharusnya sidebarOpen &&)'
    ).toBe(false);
  });

  it('memastikan navigasi Super Admin mencantumkan menu Daftar Harga (/price-list) (NAV-008)', () => {
    const content = fs.readFileSync(appShellPath, 'utf8');
    
    // Cari blok superAdminNav
    const superAdminNavBlock = content.match(/const superAdminNav = \[([\s\S]*?)\];/);
    expect(superAdminNavBlock).toBeDefined();
    expect(superAdminNavBlock![1]).toContain("href: '/price-list'");
  });

  it('memastikan standardisasi istilah navigasi Dashboard dan Pelanggan seragam antar role (Keputusan 1 & NAV-011)', () => {
    const content = fs.readFileSync(appShellPath, 'utf8');

    // salesDesktopNav tidak boleh menggunakan Beranda atau Customer
    const salesDesktopNavBlock = content.match(/const salesDesktopNav = \[([\s\S]*?)\];/);
    expect(salesDesktopNavBlock).toBeDefined();
    expect(salesDesktopNavBlock![1]).not.toContain("label: 'Beranda'");
    expect(salesDesktopNavBlock![1]).toContain("label: 'Dashboard'");
    expect(salesDesktopNavBlock![1]).not.toContain("label: 'Customer'");
    expect(salesDesktopNavBlock![1]).toContain("label: 'Pelanggan'");

    // salesNav mobile juga seragam
    const salesNavBlock = content.match(/const salesNav = \[([\s\S]*?)\];/);
    expect(salesNavBlock).toBeDefined();
    expect(salesNavBlock![1]).not.toContain("label: 'Beranda'");
    expect(salesNavBlock![1]).toContain("label: 'Dashboard'");
    expect(salesNavBlock![1]).not.toContain("label: 'Customer'");
    expect(salesNavBlock![1]).toContain("label: 'Pelanggan'");
  });
});
