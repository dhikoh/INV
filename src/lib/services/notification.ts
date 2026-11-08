import { prisma } from '@/lib/db';
import { bot } from '@/lib/telegram/bot';
import { escapeHtml, prefix } from '@/lib/telegram/format';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { InlineKeyboard } from 'grammy';
import type { TxClient } from './invoice';

export interface CreateNotificationInput {
  businessId?: string | null;
  userId: string;
  type: string;
  title: string;
  body: string;
  linkPath?: string | null;
  dedupeKey: string;
}

/**
 * Membuat notifikasi dalam aplikasi dan menyiapkan pengiriman ke Telegram.
 * Idempoten berdasarkan dedupeKey.
 *
 * Rujukan: Seksi 12.5 & 13.2 Dokumen Spesifikasi.
 */
export async function createNotification(
  tx: TxClient,
  input: CreateNotificationInput
) {
  // Cek apakah notifikasi dengan dedupeKey ini sudah ada
  const existing = await tx.notification.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });

  if (existing) {
    return existing;
  }

  return tx.notification.create({
    data: {
      businessId: input.businessId ?? null,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath ?? null,
      dedupeKey: input.dedupeKey,
    },
  });
}

/**
 * Mengirim pesan notifikasi ke akun Telegram pengguna.
 *
 * Efek Samping:
 * - Sukses: Mengisi telegramSentAt dan mengosongkan telegramError.
 * - Gagal 403 (User memblokir bot): Menandai User.telegramBlocked = true dan mencatat telegramError.
 * - Gagal 429 (Rate Limit): Rethrow error agar antrean pg-boss menunda & mencoba ulang.
 * - Idempoten: Tidak mengirim ulang jika telegramSentAt sudah terisi.
 */
export async function sendTelegramNotification(notificationId: string): Promise<{
  sent: boolean;
  alreadySent?: boolean;
  blocked?: boolean;
  reason?: string;
}> {
  const notif = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notif) {
    return { sent: false, reason: 'NOT_FOUND' };
  }

  if (notif.telegramSentAt) {
    return { sent: true, alreadySent: true };
  }

  const user = await prisma.user.findUnique({
    where: { id: notif.userId },
    include: { business: true },
  });

  if (!user || !user.telegramChatId || user.telegramBlocked) {
    return {
      sent: false,
      reason: user?.telegramBlocked ? 'USER_BLOCKED' : 'NOT_LINKED',
    };
  }

  const businessName = user.business?.name || 'OmniCat';
  const text = `<b>${escapeHtml(notif.title)}</b>\n\n${notif.body}`;
  const message = prefix(businessName, text);

  // Buat tombol interaktif sesuai Seksi 12.4 Dokumen Spesifikasi
  const keyboard = new InlineKeyboard();

  if (notif.type === 'APPROVAL_REQUEST') {
    let invoiceId: string | null = null;
    if (notif.linkPath && notif.linkPath.includes('/approvals/')) {
      invoiceId = notif.linkPath.replace('/approvals/', '').split('?')[0];
    } else if (notif.dedupeKey) {
      if (notif.dedupeKey.startsWith('approval_req_')) {
        const withoutPrefix = notif.dedupeKey.slice('approval_req_'.length);
        if (withoutPrefix.endsWith(`_${notif.userId}`)) {
          invoiceId = withoutPrefix.slice(0, -(notif.userId.length + 1));
        } else {
          invoiceId = withoutPrefix;
        }
      } else if (notif.dedupeKey.startsWith('req_final_')) {
        const withoutPrefix = notif.dedupeKey.slice('req_final_'.length);
        if (withoutPrefix.endsWith(`_${notif.userId}`)) {
          invoiceId = withoutPrefix.slice(0, -(notif.userId.length + 1));
        } else {
          invoiceId = withoutPrefix;
        }
      } else {
        const match = notif.dedupeKey.match(/^(?:approval_req|APPROVE_REQ|INVOICE_SUBMITTED):([^:]+)/);
        if (match) invoiceId = match[1];
      }
    }

    if (invoiceId) {
      keyboard
        .text('Setujui', `ap:${invoiceId}:y`)
        .url('Tolak', `${env.APP_URL}/tg/approvals/${invoiceId}?reject=1`)
        .row()
        .url('Buka', `${env.APP_URL}/tg/approvals/${invoiceId}`);
    } else if (notif.linkPath) {
      keyboard.url('Buka', `${env.APP_URL}${notif.linkPath}`);
    }
  } else if (
    notif.type === 'PAYMENT_PENDING' ||
    notif.type === 'PAYMENT_SUBMITTED'
  ) {
    let paymentId: string | null = null;
    if (notif.linkPath && notif.linkPath.includes('/payments/')) {
      paymentId = notif.linkPath.replace('/payments/', '').split('?')[0];
    } else if (notif.linkPath && notif.linkPath.includes('id=')) {
      paymentId = notif.linkPath.split('id=')[1].split('&')[0];
    } else if (notif.dedupeKey) {
      const match = notif.dedupeKey.match(/^(?:pay_pending|PAYMENT_SUBMITTED):([^:]+)/);
      if (match) paymentId = match[1];
      else {
        const parts = notif.dedupeKey.split('_');
        if (parts.length >= 3) {
          paymentId = parts[2];
        }
      }
    }

    if (paymentId) {
      keyboard
        .text('Verifikasi', `pv:${paymentId}:y`)
        .url('Buka', `${env.APP_URL}/tg/payments`);
    } else {
      keyboard.url('Buka', `${env.APP_URL}/tg/payments`);
    }
  } else if (notif.linkPath) {
    const path = notif.linkPath.startsWith('/')
      ? notif.linkPath
      : `/${notif.linkPath}`;
    keyboard.url('Buka', `${env.APP_URL}${path}`);
  }

  // Jeda aman 50ms antar pesan berurutan (Seksi 12.5)
  await new Promise((resolve) => setTimeout(resolve, 50));

  try {
    const sendOptions: {
      parse_mode: 'HTML';
      reply_markup?: InlineKeyboard;
    } = {
      parse_mode: 'HTML',
    };

    if (keyboard.inline_keyboard.length > 0) {
      sendOptions.reply_markup = keyboard;
    }

    await bot.api.sendMessage(
      Number(user.telegramChatId),
      message,
      sendOptions
    );

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        telegramSentAt: new Date(),
        telegramError: null,
      },
    });

    return { sent: true };
  } catch (err: unknown) {
    const errorObj =
      err && typeof err === 'object'
        ? (err as {
            error_code?: number;
            status?: number;
            message?: string;
            description?: string;
          })
        : null;

    const errorCode = errorObj?.error_code || errorObj?.status;
    const is403 =
      errorCode === 403 ||
      String(errorObj?.message || '').includes('403') ||
      String(errorObj?.description || '').includes('blocked');

    const is429 = errorCode === 429;

    if (is403) {
      // User memblokir bot
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramBlocked: true },
      });

      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          telegramError: 'Bot diblokir oleh pengguna (403)',
        },
      });

      logger.warn(
        { userId: user.id, chatId: String(user.telegramChatId) },
        'Telegram bot diblokir oleh pengguna'
      );

      return { sent: false, blocked: true };
    }

    // Catat pesan kesalahan ke notifikasi
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        telegramError: err instanceof Error ? err.message : String(err),
      },
    });

    if (is429) {
      logger.warn({ err }, 'Telegram rate limit 429, rethrowing for retry');
      throw err;
    }

    throw err;
  }
}
