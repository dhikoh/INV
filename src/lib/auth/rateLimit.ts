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
