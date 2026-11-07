import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '../db';
import { env } from '../env';
import { Session, User } from '@prisma/client';

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 604800 detik (7 hari)
export const SLIDING_THRESHOLD_MS = 10 * 60 * 1000; // 10 menit
export const MAX_ACTIVE_SESSIONS = 5;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(env.SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(env.SESSION_COOKIE_NAME, '', {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

export interface CreateSessionOptions {
  ip?: string | null;
  userAgent?: string | null;
  activeBusinessId?: string | null;
}

export async function createSession(
  userId: string,
  options?: CreateSessionOptions
): Promise<{ token: string; session: Session }> {
  // Ambil sesi aktif yang ada untuk pengguna ini
  const activeSessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Batasi maksimal 5 sesi aktif: cabut sesi terlama jika sudah mencapai batas
  if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
    const excessCount = activeSessions.length - (MAX_ACTIVE_SESSIONS - 1);
    const toRevokeIds = activeSessions
      .slice(0, excessCount)
      .map((s) => s.id);

    await prisma.session.updateMany({
      where: { id: { in: toRevokeIds } },
      data: { revokedAt: new Date() },
    });
  }

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ip: options?.ip ?? null,
      userAgent: options?.userAgent ?? null,
      activeBusinessId: options?.activeBusinessId ?? null,
    },
  });

  return { token, session };
}

export async function findValidSession(
  token: string
): Promise<(Session & { user: User }) | null> {
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  const now = new Date();
  if (session.revokedAt !== null || session.expiresAt <= now) {
    return null;
  }

  // Sliding expiration: perbarui lastUsedAt & expiresAt jika sudah lewat dari 10 menit
  if (now.getTime() - session.lastUsedAt.getTime() > SLIDING_THRESHOLD_MS) {
    const newExpiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: now,
        expiresAt: newExpiresAt,
      },
    });
    session.lastUsedAt = now;
    session.expiresAt = newExpiresAt;
  }

  return session;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      id: { not: currentSessionId },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
