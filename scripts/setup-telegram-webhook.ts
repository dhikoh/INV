/**
 * BentoCat / OmniCat - Setup Webhook & Mini App Menu Button Telegram Bot (Seksi 12.1)
 *
 * Menghubungkan bot Telegram ke webhook endpoint aplikasi serta mengonfigurasi
 * tombol menu Mini App agar mengarah ke [APP_URL]/tg.
 *
 * Penggunaan:
 *   pnpm tsx scripts/setup-telegram-webhook.ts
 */

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

  console.log('=== Konfigurasi Webhook & Menu Button Telegram Bot (Seksi 12.1) ===');

  if (!token) {
    console.error('Error: TELEGRAM_BOT_TOKEN wajib disetel di environment.');
    process.exit(1);
  }

  if (!webhookSecret || webhookSecret.length < 32) {
    console.error('Error: TELEGRAM_WEBHOOK_SECRET wajib disetel minimal 32 karakter acak.');
    process.exit(1);
  }

  if (!appUrl || !appUrl.startsWith('https://')) {
    console.error('Error: APP_URL wajib menggunakan protokol HTTPS (syarat mutlak Telegram Webhook & Mini App).');
    process.exit(1);
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const miniAppUrl = `${appUrl}/tg`;

  console.log(`- Bot Token      : ${token.slice(0, 10)}...`);
  console.log(`- Webhook URL    : ${webhookUrl}`);
  console.log(`- Mini App URL   : ${miniAppUrl}`);

  // 1. Pasang Webhook Telegram
  console.log('\n1. Mengirim perintah setWebhook ke Telegram Bot API...');
  const webhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
    }),
  });

  const webhookJson = await webhookRes.json();
  if (!webhookJson.ok) {
    console.error('Gagal memasang webhook:', webhookJson);
    process.exit(1);
  }
  console.log('✓ Webhook berhasil dipasang:', webhookJson.description);

  // 2. Pasang Tombol Menu Mini App
  console.log('\n2. Mengirim perintah setChatMenuButton ke Telegram Bot API...');
  const menuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Buka Aplikasi',
        web_app: {
          url: miniAppUrl,
        },
      },
    }),
  });

  const menuJson = await menuRes.json();
  if (!menuJson.ok) {
    console.error('Gagal memasang chat menu button:', menuJson);
    process.exit(1);
  }
  console.log('✓ Menu button Mini App berhasil dipasang:', menuJson.description);

  console.log('\n=== Setup Telegram Berhasil 100% ===');
}

main().catch((err) => {
  console.error('Terjadi kesalahan fatal:', err);
  process.exit(1);
});

