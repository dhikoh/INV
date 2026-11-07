import pino from 'pino';
import { env } from './env';

export const REDACTED_KEYS = [
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'initData',
  'APP_SECRET',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.initData',
  '*.APP_SECRET',
];

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACTED_KEYS,
    censor: '[REDACTED]',
  },
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
