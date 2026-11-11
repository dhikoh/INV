import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('NAV-010: Ketersediaan Halaman 404 (not-found.tsx) & Error Boundary (error.tsx)', () => {
  const notFoundPath = path.resolve(__dirname, '../../src/app/not-found.tsx');
  const errorPath = path.resolve(__dirname, '../../src/app/error.tsx');

  it('memastikan berkas src/app/not-found.tsx tersedia dan memiliki tombol kembali ke dashboard', () => {
    expect(fs.existsSync(notFoundPath)).toBe(true);
    const content = fs.readFileSync(notFoundPath, 'utf8');

    expect(content).toContain('404');
    expect(content).toContain('/dashboard');
    expect(content).toContain('Kembali ke Dashboard');
  });

  it('memastikan berkas src/app/error.tsx tersedia dengan client boundary dan tombol reset', () => {
    expect(fs.existsSync(errorPath)).toBe(true);
    const content = fs.readFileSync(errorPath, 'utf8');

    expect(content).toContain("'use client'");
    expect(content).toContain('reset()');
    expect(content).toContain('/dashboard');
  });
});
