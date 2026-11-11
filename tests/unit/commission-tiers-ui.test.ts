import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-005: Integrasi UI Skema Komisi Berjenjang (Commission Tiers)', () => {
  const businessSettingsPagePath = path.resolve(__dirname, '../../src/app/(app)/settings/business/page.tsx');

  it('memastikan berkas pengaturan usaha memanggil endpoint resmi /api/v1/commission/tiers', () => {
    expect(fs.existsSync(businessSettingsPagePath)).toBe(true);
    const content = fs.readFileSync(businessSettingsPagePath, 'utf8');

    // Harus terintegrasi dengan endpoint /api/v1/commission/tiers
    expect(content).toContain('/api/v1/commission/tiers');
    expect(content).toContain('Commission Tier');
    expect(content).toContain('minAchievementBps');
    expect(content).toContain('rateBps');
  });
});
