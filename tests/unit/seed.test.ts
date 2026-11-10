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

describe('Prisma Seed Super Admin (T1.2 & Seksi 16.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memperbarui akun bila sudah ada akun Super Admin di database', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'existing_admin_1',
      username: 'owner',
      role: Role.SUPERADMIN,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'existing_admin_1',
      username: 'owner',
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      isActive: true,
      mustChangePassword: false,
    } as never);

    const user = await seedSuperAdmin({
      username: 'owner',
      password: 'PasswordSuper123!',
    });

    expect(user.id).toBe('existing_admin_1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'existing_admin_1' },
      data: expect.objectContaining({
        isActive: true,
        mustChangePassword: false,
        passwordHash: expect.stringContaining('$argon2id$'),
      }),
    });
  });

  it('berhasil melakukan seed Super Admin baru dengan password argon2id dan username huruf kecil', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'admin_new_id',
      username: 'owner',
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: false,
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
        mustChangePassword: false,
        passwordHash: expect.stringContaining('$argon2id$'),
      }),
    });
  });
});
