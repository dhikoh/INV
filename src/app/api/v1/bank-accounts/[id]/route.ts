import { z } from 'zod';
import { withApi } from '@/lib/api/withApi';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/money';
import { audit } from '@/lib/audit/audit';
import { requireBusiness } from '@/lib/auth/context';
import { Role } from '@prisma/client';

const BankAccountUpdateSchema = z
  .object({
    bankName: z.string().trim().min(2, 'Nama bank minimal 2 karakter').max(50).optional(),
    accountNumber: z
      .string()
      .trim()
      .min(3, 'Nomor rekening minimal 3 digit')
      .max(50)
      .optional(),
    accountHolder: z
      .string()
      .trim()
      .min(2, 'Nama pemilik rekening minimal 2 karakter')
      .max(100)
      .optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const GET = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const id = params?.id;
    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID rekening bank wajib diisi', 400);
    }

    const account = await prisma.bankAccount.findFirst({
      where: {
        id,
        businessId,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new DomainError('NOT_FOUND', 'Rekening bank tidak ditemukan', 404);
    }

    return {
      data: account,
    };
  }
);

export const PATCH = withApi(
  {
    roles: [Role.SUPERADMIN],
    body: BankAccountUpdateSchema,
  },
  async ({ ctx, params, body }) => {
    const businessId = requireBusiness(ctx);
    const id = params?.id;
    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID rekening bank wajib diisi', 400);
    }

    const existing = await prisma.bankAccount.findFirst({
      where: {
        id,
        businessId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Rekening bank tidak ditemukan', 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Jika dijadikan default, lepas status default dari rekening lain di usaha yang sama
      if (body.isDefault === true) {
        await tx.bankAccount.updateMany({
          where: {
            businessId,
            id: { not: existing.id },
            isDefault: true,
            deletedAt: null,
          },
          data: { isDefault: false },
        });
      }

      const account = await tx.bankAccount.update({
        where: { id: existing.id },
        data: {
          bankName: body.bankName,
          accountNumber: body.accountNumber,
          accountHolder: body.accountHolder,
          isDefault: body.isDefault,
        },
      });

      await audit(tx, ctx, {
        action: 'BANK_ACCOUNT_UPDATE',
        entityType: 'BankAccount',
        entityId: account.id,
        businessId,
        summary: `Perbarui rekening bank ${account.bankName} - ${account.accountNumber}`,
        before: existing,
        after: account,
      });

      return account;
    });

    return {
      data: updated,
    };
  }
);

export const DELETE = withApi(
  {
    roles: [Role.SUPERADMIN],
  },
  async ({ ctx, params }) => {
    const businessId = requireBusiness(ctx);
    const id = params?.id;
    if (!id) {
      throw new DomainError('BAD_REQUEST', 'ID rekening bank wajib diisi', 400);
    }

    const existing = await prisma.bankAccount.findFirst({
      where: {
        id,
        businessId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Rekening bank tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
          isDefault: false,
        },
      });

      await audit(tx, ctx, {
        action: 'BANK_ACCOUNT_DELETE',
        entityType: 'BankAccount',
        entityId: existing.id,
        businessId,
        summary: `Hapus rekening bank ${existing.bankName} - ${existing.accountNumber}`,
        before: existing,
      });
    });

    return {
      data: { success: true },
    };
  }
);
