import { startBoss, stopBoss } from './boss';
import { sendTelegramNotification } from '@/lib/services/notification';
import {
  scanRepeatReminders,
  scanInvoicesDue,
  scanCrmTasks,
  scanOwnerDigest,
  runHousekeeping,
} from '@/lib/services/reminder';
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

  // 2. reminders.repeat.scan (Seksi 13.2 - Setiap hari 08:00 WIB)
  await boss.createQueue('reminders.repeat.scan');
  await boss.schedule(
    'reminders.repeat.scan',
    '0 8 * * *',
    {},
    { tz: 'Asia/Jakarta' }
  );
  await boss.work('reminders.repeat.scan', async () => {
    logger.info('Menjalankan jadwal reminders.repeat.scan');
    await scanRepeatReminders(new Date());
  });

  // 3. invoices.due.scan (Seksi 13.2 - Setiap hari 08:00 WIB)
  await boss.createQueue('invoices.due.scan');
  await boss.schedule(
    'invoices.due.scan',
    '0 8 * * *',
    {},
    { tz: 'Asia/Jakarta' }
  );
  await boss.work('invoices.due.scan', async () => {
    logger.info('Menjalankan jadwal invoices.due.scan');
    await scanInvoicesDue(new Date());
  });

  // 4. crm.tasks.scan (Seksi 13.2 - Setiap hari 08:00 WIB)
  await boss.createQueue('crm.tasks.scan');
  await boss.schedule(
    'crm.tasks.scan',
    '0 8 * * *',
    {},
    { tz: 'Asia/Jakarta' }
  );
  await boss.work('crm.tasks.scan', async () => {
    logger.info('Menjalankan jadwal crm.tasks.scan');
    await scanCrmTasks(new Date());
  });

  // 5. owner.digest (Seksi 13.2 - Setiap hari 08:00 WIB)
  await boss.createQueue('owner.digest');
  await boss.schedule(
    'owner.digest',
    '0 8 * * *',
    {},
    { tz: 'Asia/Jakarta' }
  );
  await boss.work('owner.digest', async () => {
    logger.info('Menjalankan jadwal owner.digest');
    await scanOwnerDigest(new Date());
  });

  // 6. housekeeping (Seksi 13.2 - Setiap hari 03:00 WIB)
  await boss.createQueue('housekeeping');
  await boss.schedule('housekeeping', '0 3 * * *', {}, { tz: 'Asia/Jakarta' });
  await boss.work('housekeeping', async () => {
    logger.info('Menjalankan jadwal housekeeping');
    await runHousekeeping(new Date());
  });

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
