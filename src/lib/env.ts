import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  TEST_DATABASE_URL: z.string().optional(),
  APP_URL: z.string().url('APP_URL harus berupa URL yang valid'),
  SESSION_COOKIE_NAME: z.string().default('sid'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  UPLOAD_DIR: z.string().default('/data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(5),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(''),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(''),
  APP_SECRET: z.string().min(16, 'APP_SECRET minimal 16 karakter acak'),
  SEED_SUPERADMIN_USERNAME: z.string().optional(),
  SEED_SUPERADMIN_PASSWORD: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().default('/usr/bin/chromium'),
  TZ: z.string().default('Asia/Jakarta'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(input: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - [${err.path.join('.')}]: ${err.message}`)
      .join('\n');
    const message = `\n========================================\n❌ Konfigurasi Environment Gagal:\n${errorDetails}\n========================================\n`;
    throw new Error(message);
  }
  return result.data;
}

export const env: Env =
  process.env.NODE_ENV === 'test'
    ? envSchema.parse({
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/app',
        APP_URL: process.env.APP_URL || 'http://localhost:3000',
        APP_SECRET:
          process.env.APP_SECRET || 'test_secret_key_at_least_16_chars_12345',
        NODE_ENV: 'test',
      })
    : validateEnv(process.env);
