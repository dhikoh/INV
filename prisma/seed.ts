import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';
import { Role } from '@prisma/client';
import { logger } from '../src/lib/logger';

export interface SeedOptions {
  username?: string;
  password?: string;
}

export async function seedSuperAdmin(options?: SeedOptions) {
  const username = options?.username ?? process.env.SEED_SUPERADMIN_USERNAME;
  const password = options?.password ?? process.env.SEED_SUPERADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'SEED_SUPERADMIN_USERNAME dan SEED_SUPERADMIN_PASSWORD wajib disetel di environment.'
    );
  }

  if (password.length < 12) {
    throw new Error('SEED_SUPERADMIN_PASSWORD minimal 12 karakter.');
  }

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPERADMIN, deletedAt: null },
  });

  if (existingSuperAdmin) {
    throw new Error('Super Admin sudah ada. Seed ditolak.');
  }

  const passwordHash = await hashPassword(password, username);

  const superAdmin = await prisma.user.create({
    data: {
      username: username.trim().toLowerCase(),
      passwordHash,
      name: 'Super Admin',
      role: Role.SUPERADMIN,
      businessId: null,
      isActive: true,
      mustChangePassword: true,
    },
  });

  logger.info(
    { userId: superAdmin.id, username: superAdmin.username },
    'Super Admin berhasil di-seed dengan mustChangePassword = true'
  );

  return superAdmin;
}

if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))
) {
  seedSuperAdmin()
    .then(() => {
      process.exit(0);
    })
    .catch((err: Error) => {
      logger.error({ err }, err.message);
      process.exit(1);
    });
}
