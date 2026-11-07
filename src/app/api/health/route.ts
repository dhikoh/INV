import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET() {
  let dbStatus = false;
  try {
    if (env.DATABASE_URL) {
      dbStatus = true;
    }
  } catch {
    dbStatus = false;
  }

  return NextResponse.json(
    {
      ok: true,
      db: dbStatus,
      version: '0.1.0',
    },
    { status: 200 }
  );
}
