import { startBoss, stopBoss } from './boss';
import { sendTelegramNotification } from '@/lib/services/notification';
import { logger } from '@/lib/logger';

async function main() {
  logger.info('Starting OmniCat background worker process...');

  const boss = await startBoss();

  // 1. Antrean telegram.send (Seksi 12.5 & 13.2)
  await boss.createQueue('telegram.send', {
    retryLimit: 5,
    retryBackoff: true,
  });

  await boss.work(
    'telegram.send',
    { batchSize: 1 },
    async (jobs: Array<{ data: { notificationId: string } }>) => {
      const [job] = jobs;
      if (!job || !job.data?.notificationId) return;

      logger.info(
        { notificationId: job.data.notificationId },
        'Memproses pengiriman pesan Telegram'
      );

      await sendTelegramNotification(job.data.notificationId);
    }
  );

  logger.info('OmniCat worker process is active and listening for jobs.');

  // Tangani sinyal pemutusan anggun (Graceful shutdown)
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker menerima sinyal berhenti, mematikan pg-boss...');
    await stopBoss();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    logger.fatal({ err }, 'Worker process fatal crash');
    process.exit(1);
  });
}

