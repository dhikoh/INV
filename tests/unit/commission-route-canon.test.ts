import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-012: Resolusi Duplikasi Rute Pembayaran Komisi', () => {
  const canonRoutePath = path.resolve(
    __dirname,
    '../../src/app/api/v1/commission/entries/[id]/pay/route.ts'
  );
  const aliasRoutePath = path.resolve(
    __dirname,
    '../../src/app/api/v1/commissions/[id]/pay/route.ts'
  );
  const orderPagePath = path.resolve(
    __dirname,
    '../../src/app/(app)/orders/[id]/page.tsx'
  );
  const salesPagePath = path.resolve(
    __dirname,
    '../../src/app/(app)/sales/[id]/page.tsx'
  );

  it('memastikan rute kanon /commission/entries/:id/pay aktif dan digunakan oleh seluruh UI', () => {
    expect(fs.existsSync(canonRoutePath)).toBe(true);

    const orderContent = fs.readFileSync(orderPagePath, 'utf8');
    const salesContent = fs.readFileSync(salesPagePath, 'utf8');

    // Seluruh UI wajib menggunakan rute kanon
    expect(orderContent).toContain('/api/v1/commission/entries/');
    expect(orderContent).not.toContain('/api/v1/commissions/');

    expect(salesContent).toContain('/api/v1/commission/entries/');
    expect(salesContent).not.toContain('/api/v1/commissions/');
  });

  it('memastikan rute alias /commissions/:id/pay didepresiasi dan mendelegasikan ke rute kanon', () => {
    expect(fs.existsSync(aliasRoutePath)).toBe(true);
    const aliasContent = fs.readFileSync(aliasRoutePath, 'utf8');

    expect(aliasContent).toContain('@deprecated');
    expect(aliasContent).toContain('NAV-012');
    expect(aliasContent).toContain('commission/entries');
  });
});
