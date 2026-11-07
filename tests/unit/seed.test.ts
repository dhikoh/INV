import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedSuperAdmin } from '../../prisma/seed';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('Prisma Seed Super Admin (T1.2 & Seksi 16.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menolak bila username atau password tidak disetel', async () => {
    await expect(
      seedSuperAdmin({ username: '', password: '' })
    ).rejects.toThrow(
      'SEED_SUPERADMIN_USERNAME dan SEED_SUPERADMIN_PASSWORD wajib disetel di environment.'
    );
  });

  it('menolak bila password kurang dari 12 karakter', async () => {
    await expect(
      seedSuperAdmin({ username: 'owner', password: 'shortpass12' })
    ).rejects.toThrow('SEED_SUPERADMIN_PASSWORD minimal 12 karakter.');
  });

  it('menolak bila sudah ada akun Super Admin di database', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'existing_admin_1',
      role: Role.SUPERADMIN,
    } as never);

    await expect(
      seedSuperAdmin({
        username: 'owner',
        password: 'PasswordSuper123!',
      })
    ).rejects.toThrow('Super Admin sudah ada. Seed ditolak.');
  });

  it('berhasil melakukan seed Super Admin dengan password argon2id dan mustChangePassword = true', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'admin_new_id',
      username: 'owner',
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: true,
    } as never);

    const user = await seedSuperAdmin({
      username: 'Owner',
      password: 'PasswordSuper123!',
    });

    expect(user.id).toBe('admin_new_id');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'owner',
        name: 'Super Admin',
        role: Role.SUPERADMIN,
        businessId: null,
        isActive: true,
        mustChangePassword: true,
        passwordHash: expect.stringContaining('$argon2id$'),
      }),
    });
  });
});
