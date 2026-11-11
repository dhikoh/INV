import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-004: Integrasi UI Verifikasi Tabrakan Toko (Collision Resolution)', () => {
  const customerDetailPagePath = path.resolve(__dirname, '../../src/app/(app)/customers/[id]/page.tsx');

  it('memastikan berkas detail pelanggan memanggil endpoint resmi /api/v1/customers/:id/verify', () => {
    expect(fs.existsSync(customerDetailPagePath)).toBe(true);
    const content = fs.readFileSync(customerDetailPagePath, 'utf8');

    // Harus terintegrasi dengan endpoint /api/v1/customers/:id/verify
    expect(content).toContain('/verify');
    expect(content).toContain('handleVerifyCollision');
    expect(content).toContain('\'APPROVE\'');
    expect(content).toContain('\'REASSIGN\'');
    expect(content).toContain('\'REJECT\'');
  });

  it('memastikan ada banner tindakan penyelesaian tabrakan saat customer memiliki tag PENDING_VERIFIKASI_ADMIN', () => {
    const content = fs.readFileSync(customerDetailPagePath, 'utf8');

    expect(content).toContain('PENDING_VERIFIKASI_ADMIN');
    expect(content).toContain('Verifikasi Tabrakan Toko');
  });
});
