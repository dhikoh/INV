import { webhookCallback } from 'grammy';
import { bot } from '@/lib/telegram/bot';
import { env } from '@/lib/env';
import { NextResponse } from 'next/server';

/**
 * POST /api/telegram/webhook
 * Webhook handler untuk Telegram Bot.
 *
 * Keamanan:
 * - Menolak 401 Unauthorized jika header x-telegram-bot-api-secret-token tidak cocok.
 * Rujukan: Seksi 12.1 Dokumen Spesifikasi.
 */
export const POST = async (req: Request) => {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');

  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid secret token' },
      { status: 401 }
    );
  }

  return webhookCallback(bot, 'std/http')(req);
};
