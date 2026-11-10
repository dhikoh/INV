import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { requireBusiness } from '@/lib/auth/context';
import { Role } from '@prisma/client';

const BankAccountCreateSchema = z
  .object({
    bankName: z.string().trim().min(2, 'Nama bank minimal 2 karakter').max(50),
    accountNumber: z
      .string()
      .trim()
      .min(3, 'Nomor rekening minimal 3 digit')
      .max(50),
    accountHolder: z
      .string()
      .trim()
      .min(2, 'Nama pemilik rekening minimal 2 karakter')
      .max(100),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const sessionBusinessId = requireBusiness(ctx);
    const businessId = params.id;

    if (businessId !== sessionBusinessId) {
      throw new DomainError(
        'FORBIDDEN',
        'Tidak memiliki akses ke rekening unit usaha lain',
        403
      );
    }

    const list = await prisma.bankAccount.findMany({
      where: {
        businessId,
        deletedAt: null,
      },
      orderBy: {
        isDefault: 'desc',
      },
    });

    return {
      data: list,
    };
  }
);

export const POST = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: BankAccountCreateSchema,
  },
  async ({ ctx, params, body }) => {
    const sessionBusinessId = requireBusiness(ctx);
    const businessId = params.id;

    if (businessId !== sessionBusinessId) {
      throw new DomainError(
        'FORBIDDEN',
        'Tidak memiliki akses ke rekening unit usaha lain',
        403
      );
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
    });

    if (!business) {
      throw new DomainError('NOT_FOUND', 'Usaha tidak ditemukan', 404);
    }

    const created = await prisma.$transaction(async (tx) => {
      // Aturan: Satu rekening default per usaha.
      // Bila rekening baru adalah default, lepas tanda default dari rekening lain di usaha ini.
      if (body.isDefault) {
        await tx.bankAccount.updateMany({
          where: { businessId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }

      const account = await tx.bankAccount.create({
        data: {
          businessId,
          bankName: body.bankName,
          accountNumber: body.accountNumber,
          accountHolder: body.accountHolder,
          isDefault: body.isDefault,
        },
      });

      await audit(tx, ctx, {
        action: 'BANK_ACCOUNT_CREATE',
        entityType: 'BankAccount',
        entityId: account.id,
        businessId,
        summary: `Tambah rekening bank ${account.bankName} - ${account.accountNumber}`,
        after: account,
      });

      return account;
    });

    return {
      data: created,
      status: 201,
    };
  }
);
