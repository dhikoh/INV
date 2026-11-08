import { PgBoss } from 'pg-boss';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let bossInstance: PgBoss | null = null;
let isStarted = false;

/**
 * Mengambil singleton instance pg-boss.
 * Rujukan: Seksi 13.2 Dokumen Spesifikasi.
 */
export function getBoss(): PgBoss {
  if (!bossInstance) {
    bossInstance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
    });

    bossInstance.on('error', (err) => {
      logger.error({ err }, 'pg-boss queue error');
    });
  }

  return bossInstance;
}

/**
 * Memulai pg-boss.
 */
export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss();
  if (!isStarted) {
    await boss.start();
    isStarted = true;
    logger.info('pg-boss engine started');
  }
  return boss;
}

/**
 * Menghentikan pg-boss secara anggun (graceful shutdown).
 */
export async function stopBoss(): Promise<void> {
  if (bossInstance && isStarted) {
    await bossInstance.stop();
    isStarted = false;
    logger.info('pg-boss engine stopped');
  }
}

/**
 * Mengantrekan job pengiriman pesan Telegram ke antrean pg-boss.
 * Aman dipanggil dari dalam proses web app (fire-and-forget setelah commit transaksi).
 */
export async function enqueueTelegramSend(
  notificationId: string
): Promise<string | null> {
  // Jika dalam testing atau offline tanpa database URL valid, lewati antrean
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  try {
    const boss = getBoss();
    const jobId = await boss.send('telegram.send', { notificationId });
    return jobId;
  } catch (err) {
    logger.error(
      { err, notificationId },
      'Gagal mengantrekan telegram.send ke pg-boss'
    );
    return null;
  }
}
