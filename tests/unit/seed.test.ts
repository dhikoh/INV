import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedSuperAdmin } from '../../prisma/seed';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Prisma Seed Super Admin (AUD-SEC-001 & BLUEPRINT Bagian 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SEED_SUPERADMIN_USERNAME;
    delete process.env.SEED_SUPERADMIN_PASSWORD;
  });

  it('menolak berjalan bila password kurang dari 12 karakter atau tidak disetel di env (tanpa fallback di kode)', async () => {
    // Password terlalu pendek (<12 karakter)
    await expect(
      seedSuperAdmin({
        username: 'superadmin',
        password: 'pendek',
      })
    ).rejects.toThrowError(/minimal 12 karakter/);

    // Password kosong tanpa env
    await expect(
      seedSuperAdmin({
        username: 'superadmin',
      })
    ).rejects.toThrowError(/SEED_SUPERADMIN_PASSWORD wajib disetel/);
  });

  it('menolak menimpa akun bila Super Admin sudah ada di database', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'existing_admin_1',
      username: 'superadmin',
      role: Role.SUPERADMIN,
    } as never);

    await expect(
      seedSuperAdmin({
        username: 'superadmin',
        password: 'PasswordAmanSuperAdmin123!',
      })
    ).rejects.toThrowError(/Akun Super Admin sudah terdaftar/);

    // Pastikan tidak ada pemanggilan update untuk menimpa akun
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('berhasil membuat Super Admin baru dengan mustChangePassword: true dan password aman argon2id', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'admin_new_id',
      username: 'superadmin',
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: true,
    } as never);

    const user = await seedSuperAdmin({
      username: 'SuperAdmin',
      password: 'PasswordAmanSuperAdmin123!',
    });

    expect(user.id).toBe('admin_new_id');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'superadmin',
        name: 'Super Admin',
        role: Role.SUPERADMIN,
        businessId: null,
        isActive: true,
        mustChangePassword: true, // Sesuai BLUEPRINT Bagian 9
        passwordHash: expect.stringContaining('$argon2id$'),
      }),
    });
  });
});
