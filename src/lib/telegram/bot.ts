import { Bot } from 'grammy';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashLinkCode } from './linkCode';
import { escapeHtml, prefix } from './format';
import {
  Role,
  PaymentStatus,
  InvoiceStatus,
  OrderStatus,
  InvoiceTheme,
} from '@prisma/client';
import { approveInvoice } from '@/lib/services/invoice';
import { verifyPayment } from '@/lib/services/payment';
import type { Ctx } from '@/lib/auth/context';

// Gunakan token dari environment, atau token pengujian aman jika belum diatur
const botToken =
  env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN.trim().length > 0
    ? env.TELEGRAM_BOT_TOKEN
    : '123456789:AAFakeTokenForLocalTesting00000000';

export const bot = new Bot(botToken, {
  botInfo: {
    id: 123456789,
    is_bot: true,
    first_name: 'BentoCat Bot',
    username: env.TELEGRAM_BOT_USERNAME || 'bentocat_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  },
});

// Rate limiter sederhana untuk percobaan /start: maksimal 5 percobaan per 10 menit per chat.id
const ATTEMPTS_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const rateLimitMap = new Map<string, number[]>();

export function isRateLimited(chatId: string | number | bigint): boolean {
  const key = String(chatId);
  const now = Date.now();
  const attempts = rateLimitMap.get(key) || [];
  const recentAttempts = attempts.filter((t) => now - t < ATTEMPTS_WINDOW_MS);
  rateLimitMap.set(key, recentAttempts);
  return recentAttempts.length >= MAX_ATTEMPTS;
}

export function recordAttempt(chatId: string | number | bigint): void {
  const key = String(chatId);
  const now = Date.now();
  const attempts = rateLimitMap.get(key) || [];
  attempts.push(now);
  rateLimitMap.set(key, attempts);
}

export function resetRateLimitMapForTesting(): void {
  rateLimitMap.clear();
}

/**
 * Perintah /start [kode]:
 * Menghubungkan akun Telegram dengan akun pengguna di aplikasi web.
 * Rujukan: Seksi 12.2 Dokumen Spesifikasi.
 */
bot.command('start', async (ctx) => {
  // Hanya obrolan pribadi yang diterima
  if (ctx.chat?.type !== 'private') return;

  const code = (ctx.match ?? '').trim().toUpperCase();
  if (!code) {
    return ctx.reply('Kirim kode tautan dari halaman Profil aplikasi web.');
  }

  const chatId = BigInt(ctx.from!.id);

  if (isRateLimited(chatId)) {
    return ctx.reply('Terlalu banyak percobaan. Coba lagi nanti.');
  }

  recordAttempt(chatId);

  const codeHash = hashLinkCode(code);
  const link = await prisma.telegramLinkCode.findUnique({
    where: { codeHash },
    include: {
      user: {
        include: {
          business: true,
        },
      },
    },
  });

  // Validasi: kode salah, kedaluwarsa, sudah terpakai, atau user non-aktif
  if (
    !link ||
    link.usedAt ||
    link.expiresAt < new Date() ||
    !link.user ||
    !link.user.isActive
  ) {
    return ctx.reply('Kode tidak valid atau sudah kedaluwarsa.');
  }

  // Validasi satu akun Telegram hanya boleh terhubung ke satu user aktif
  const taken = await prisma.user.findFirst({
    where: {
      telegramChatId: chatId,
      NOT: { id: link.userId },
    },
  });

  if (taken) {
    return ctx.reply('Akun Telegram ini sudah terhubung ke akun lain.');
  }

  // Tautkan user secara atomik
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: link.userId },
      data: {
        telegramChatId: chatId,
        telegramLinkedAt: new Date(),
        telegramBlocked: false,
      },
    });

    await tx.telegramLinkCode.update({
      where: { id: link.id },
      data: {
        usedAt: new Date(),
      },
    });
  });

  const businessName = link.user.business?.name || 'OmniCat';
  return ctx.reply(
    `Terhubung sebagai ${link.user.name} (${link.user.role}) di ${businessName}.`
  );
});

/**
 * Perintah /help:
 * Menampilkan daftar bantuan perintah yang tersedia.
 */
bot.command('help', async (ctx) => {
  const helpText =
    `<b>Panduan Perintah Bot:</b>\n\n` +
    `• <code>/start &lt;kode&gt;</code> - Menghubungkan akun aplikasi Anda\n` +
    `• <code>/me</code> - Cek profil dan akun yang terhubung saat ini\n` +
    `• <code>/today</code> - Ringkasan antrean & agenda kerja hari ini\n` +
    `• <code>/help</code> - Menampilkan bantuan ini`;

  return ctx.reply(helpText, { parse_mode: 'HTML' });
});

/**
 * Perintah /me:
 * Menampilkan informasi profil akun yang sedang terhubung.
 */
bot.command('me', async (ctx) => {
  if (!ctx.from?.id) return;

  const user = await prisma.user.findFirst({
    where: {
      telegramChatId: BigInt(ctx.from.id),
      isActive: true,
    },
    include: {
      business: true,
    },
  });

  if (!user) {
    return ctx.reply(
      'Akun Telegram Anda belum terhubung. Buka menu Profil di aplikasi web untuk menghubungkan.'
    );
  }

  const linkedDate = user.telegramLinkedAt
    ? user.telegramLinkedAt.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

  const text =
    `<b>Profil Pengguna Terhubung:</b>\n` +
    `• Nama: <b>${escapeHtml(user.name)}</b> (@${escapeHtml(user.username)})\n` +
    `• Peran: <b>${user.role}</b>\n` +
    `• Unit Usaha: <b>${escapeHtml(user.business?.name || '-')}</b>\n` +
    `• Terhubung sejak: ${linkedDate}`;

  return ctx.reply(prefix(user.business?.name || 'USAHA', text), {
    parse_mode: 'HTML',
  });
});

/**
 * Perintah /today:
 * Ringkasan antrean persetujuan harian untuk Super Admin,
 * atau ringkasan tugas & order untuk staf Sales.
 */
bot.command('today', async (ctx) => {
  if (!ctx.from?.id) return;

  const user = await prisma.user.findFirst({
    where: {
      telegramChatId: BigInt(ctx.from.id),
      isActive: true,
    },
    include: {
      business: true,
    },
  });

  if (!user) {
    return ctx.reply(
      'Akun Telegram Anda belum terhubung. Buka menu Profil di aplikasi web untuk menghubungkan.'
    );
  }

  if (!user.businessId) {
    return ctx.reply('Akun Anda belum dikaitkan dengan unit usaha aktif.');
  }

  const businessId = user.businessId;

  if (user.role === Role.SUPERADMIN) {
    const [pendingInvoices, pendingPayments, lowStockCount] = await Promise.all([
      prisma.invoice.count({
        where: {
          businessId,
          status: InvoiceStatus.PENDING_APPROVAL,
          deletedAt: null,
        },
      }),
      prisma.payment.count({
        where: {
          businessId,
          status: PaymentStatus.PENDING_VERIFICATION,
        },
      }),
      prisma.product.count({
        where: {
          businessId,
          stockQty: { lt: 0 },
          deletedAt: null,
        },
      }),
    ]);

    const text =
      `<b>Ringkasan Antrean Hari Ini:</b>\n` +
      `• Faktur Menunggu Persetujuan: <b>${pendingInvoices}</b>\n` +
      `• Pembayaran Menunggu Verifikasi: <b>${pendingPayments}</b>\n` +
      `• Produk Stok Minus: <b>${lowStockCount}</b>`;

    return ctx.reply(prefix(user.business?.name || 'USAHA', text), {
      parse_mode: 'HTML',
    });
  }

  // Role: SALES
  const [activeTasks, pendingOrders] = await Promise.all([
    prisma.crmTask.count({
      where: {
        businessId,
        assignedToId: user.id,
        doneAt: null,
      },
    }),
    prisma.order.count({
      where: {
        businessId,
        salesId: user.id,
        status: { in: [OrderStatus.AWAITING_DP, OrderStatus.AWAITING_FINAL_PAYMENT] },
        deletedAt: null,
      },
    }),
  ]);

  const text =
    `<b>Ringkasan Sales Hari Ini:</b>\n` +
    `• Tugas CRM Berjalan: <b>${activeTasks}</b>\n` +
    `• Pesanan Menunggu Pembayaran: <b>${pendingOrders}</b>`;

  return ctx.reply(prefix(user.business?.name || 'USAHA', text), {
    parse_mode: 'HTML',
  });
});

/**
 * Handler pesan umum: Memberikan petunjuk jika akun belum terhubung.
 */
bot.on('message:text', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;

  const user = await prisma.user.findFirst({
    where: {
      telegramChatId: BigInt(ctx.from.id),
      isActive: true,
    },
  });

  if (!user) {
    return ctx.reply(
      'Akun Telegram Anda belum terhubung. Buka menu Profil di aplikasi web untuk menghubungkan, lalu kirim /start <kode>.'
    );
  }
});

/**
 * Handler Callback Query untuk tombol inline Telegram (Seksi 12.4 & Tabel 19.5 T4.2):
 * - ap:<invoiceId>:y -> Menyetujui faktur penjualan
 * - pv:<paymentId>:y -> Memverifikasi bukti pembayaran
 *
 * Aturan Kunci:
 * 1. Hanya Super Admin aktif yang dapat mengeksekusi aksi callback.
 * 2. Setujui lewat Telegram dilarang keras bila pesanan memiliki harga di bawah minimal (hasBelowMin).
 * 3. Eksekusi callback ganda bersifat idempoten (answerCallbackQuery "Sudah diproses" dan hapus tombol).
 * 4. Memanggil domain service yang sama persis dengan web handler (approveInvoice / verifyPayment).
 */
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const user = await prisma.user.findFirst({
    where: {
      telegramChatId: BigInt(fromId),
      isActive: true,
    },
    include: { business: true },
  });

  // Tabel 19.5: Akun non Super Admin ditolak
  if (!user || user.role !== Role.SUPERADMIN) {
    return ctx.answerCallbackQuery({
      text: 'Akses ditolak: Hanya Super Admin yang dapat melakukan aksi ini',
      show_alert: true,
    });
  }

  // 1. Aksi Persetujuan Faktur: ap:<invoiceId>:y
  const apMatch = data.match(/^ap:([^:]+):y$/);
  if (apMatch) {
    const invoiceId = apMatch[1];
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        business: true,
      },
    });

    if (!invoice) {
      return ctx.answerCallbackQuery({
        text: 'Faktur tidak ditemukan',
        show_alert: true,
      });
    }

    // Callback ganda idempoten & status invoice sudah diproses
    if (invoice.status !== InvoiceStatus.PENDING_APPROVAL) {
      await ctx
        .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
        .catch(() => {});
      return ctx.answerCallbackQuery({
        text: 'Faktur sudah diproses sebelumnya',
        show_alert: true,
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: invoice.orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      return ctx.answerCallbackQuery({
        text: 'Pesanan tidak ditemukan',
        show_alert: true,
      });
    }

    // Setujui lewat Telegram dilarang bila invoice hasBelowMin (Seksi 12.4 & Tabel 19.5)
    const hasBelowMin =
      order.hasBelowMin ||
      order.items.some(
        (item: { belowMin: boolean }) => item.belowMin
      );

    if (hasBelowMin) {
      return ctx.answerCallbackQuery({
        text: 'Ada harga di bawah minimal. Buka aplikasi untuk menyetujui dengan catatan.',
        show_alert: true,
      });
    }

    // Panggil service yang sama persis dengan web handler
    const appContext: Ctx = {
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        businessId: invoice.businessId,
      },
      role: user.role,
      businessId: invoice.businessId,
      sessionId: `tg_callback_${user.id}`,
      ip: null,
    };

    try {
      await prisma.$transaction(async (tx) => {
        await approveInvoice(tx, appContext, invoiceId, {
          theme: invoice.business.invoiceTheme || InvoiceTheme.PROFESIONAL,
        });
      });

      await ctx.answerCallbackQuery({ text: 'Faktur berhasil disetujui' });

      // Ubah pesan menjadi "Disetujui oleh {nama}" tanpa tombol
      const originalText = ctx.callbackQuery.message?.text || '';
      const approvedText = originalText
        ? `${escapeHtml(originalText)}\n\n✅ <b>Disetujui oleh ${escapeHtml(user.name)}</b>`
        : `✅ <b>Disetujui oleh ${escapeHtml(user.name)}</b>`;

      await ctx
        .editMessageText(approvedText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        })
        .catch(async () => {
          await ctx
            .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
            .catch(() => {});
        });
      return;
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Gagal menyetujui faktur';
      return ctx.answerCallbackQuery({
        text: `Gagal: ${errMsg}`,
        show_alert: true,
      });
    }
  }

  // 2. Aksi Verifikasi Pembayaran: pv:<paymentId>:y
  const pvMatch = data.match(/^pv:([^:]+):y$/);
  if (pvMatch) {
    const paymentId = pvMatch[1];
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        business: true,
      },
    });

    if (!payment) {
      return ctx.answerCallbackQuery({
        text: 'Pembayaran tidak ditemukan',
        show_alert: true,
      });
    }

    // Callback ganda idempoten
    if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
      await ctx
        .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
        .catch(() => {});
      return ctx.answerCallbackQuery({
        text: 'Pembayaran sudah diproses sebelumnya',
        show_alert: true,
      });
    }

    const appContext: Ctx = {
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        businessId: payment.businessId,
      },
      role: user.role,
      businessId: payment.businessId,
      sessionId: `tg_callback_${user.id}`,
      ip: null,
    };

    try {
      await prisma.$transaction(async (tx) => {
        await verifyPayment(tx, appContext, paymentId);
      });

      await ctx.answerCallbackQuery({
        text: 'Pembayaran berhasil diverifikasi',
      });

      const originalText = ctx.callbackQuery.message?.text || '';
      const verifiedText = originalText
        ? `${escapeHtml(originalText)}\n\n✅ <b>Diverifikasi oleh ${escapeHtml(user.name)}</b>`
        : `✅ <b>Diverifikasi oleh ${escapeHtml(user.name)}</b>`;

      await ctx
        .editMessageText(verifiedText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] },
        })
        .catch(async () => {
          await ctx
            .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
            .catch(() => {});
        });
      return;
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran';
      return ctx.answerCallbackQuery({
        text: `Gagal: ${errMsg}`,
        show_alert: true,
      });
    }
  }

  return ctx.answerCallbackQuery({ text: 'Aksi tidak dikenali' });
});
