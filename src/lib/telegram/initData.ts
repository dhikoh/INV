import crypto from 'node:crypto';
import { DomainError } from '../domain/money';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidatedInitData {
  telegramUserId: number;
  authDate: number;
  user: TelegramUser;
}

/**
 * Memvalidasi data sesi Telegram WebApp (initData) dengan algoritma resmi HMAC-SHA256.
 *
 * Rujukan: Seksi 12.3 Dokumen Spesifikasi.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 3600
): ValidatedInitData {
  const fail = () =>
    new DomainError(
      'INIT_DATA_INVALID',
      'Sesi Telegram tidak valid. Buka ulang aplikasi.',
      401
    );

  if (!initData || typeof initData !== 'string') {
    throw fail();
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw fail();
  }
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calc = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();

  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !crypto.timingSafeEqual(given, calc)) {
    throw fail();
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSec) {
    throw fail();
  }

  let user: TelegramUser | null = null;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw fail();
  }

  if (!user || typeof user.id !== 'number') {
    throw fail();
  }

  return {
    telegramUserId: user.id,
    authDate,
    user,
  };
}

/**
 * Helper untuk pengujian: membuat string initData valid bertanda tangan resmi.
 */
export function generateTestInitData(
  userData: TelegramUser,
  botToken: string,
  options?: { authDate?: number; extraParams?: Record<string, string> }
): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(options?.authDate ?? Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify(userData));

  if (options?.extraParams) {
    for (const [k, v] of Object.entries(options.extraParams)) {
      params.set(k, v);
    }
  }

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  params.set('hash', hash);
  return params.toString();
}
