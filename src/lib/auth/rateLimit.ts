import { prisma } from '../db';
import { DomainError } from '../domain/money';

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 menit
export const MAX_FAILURES_PER_USERNAME = 5;
export const MAX_FAILURES_PER_IP = 20;

export async function checkLoginRateLimit(
  username: string,
  ip: string
): Promise<void> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const normalizedUsername = username.trim().toLowerCase();

  const [usernameFailures, ipFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        username: normalizedUsername,
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  if (
    usernameFailures >= MAX_FAILURES_PER_USERNAME ||
    ipFailures >= MAX_FAILURES_PER_IP
  ) {
    throw new DomainError(
      'RATE_LIMITED',
      'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
      429
    );
  }
}

export async function recordLoginAttempt(
  username: string,
  ip: string,
  success: boolean
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      username: username.trim().toLowerCase(),
      ip,
      success,
    },
  });
}

// =========================================================================
// Pembatasan Umum & Upload (Seksi 16.1): Token Bucket di Memori
// 120 permintaan/menit per user, dan 20 permintaan/menit untuk endpoint upload
// =========================================================================

export const GENERAL_RATE_LIMIT_PER_MINUTE = 120;
export const UPLOAD_RATE_LIMIT_PER_MINUTE = 20;

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRatePerSec: number;
}

const userBuckets = new Map<string, TokenBucket>();

export function checkUserRateLimit(
  userId: string,
  isUpload: boolean = false
): void {
  const capacity = isUpload
    ? UPLOAD_RATE_LIMIT_PER_MINUTE
    : GENERAL_RATE_LIMIT_PER_MINUTE;
  const refillRatePerSec = capacity / 60;
  const key = `${userId}:${isUpload ? 'upload' : 'general'}`;
  const now = Date.now();

  let bucket = userBuckets.get(key);
  if (!bucket) {
    bucket = {
      tokens: capacity - 1,
      lastRefill: now,
      capacity,
      refillRatePerSec,
    };
    userBuckets.set(key, bucket);
    return;
  }

  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    bucket.capacity,
    bucket.tokens + elapsedSec * bucket.refillRatePerSec
  );
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    throw new DomainError(
      'RATE_LIMITED',
      isUpload
        ? 'Batas unggah berkas terlampaui (maksimal 20 per menit). Coba lagi beberapa saat lagi.'
        : 'Batas permintaan terlampaui (maksimal 120 per menit). Coba lagi beberapa saat lagi.',
      429
    );
  }

  bucket.tokens -= 1;
}

export function resetUserRateLimits(): void {
  userBuckets.clear();
}
