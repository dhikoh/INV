#!/bin/sh
set -e

# Auto-initialize database when DATABASE_URL is available
if [ -n "$DATABASE_URL" ]; then
  echo "==> [OmniCat] Syncing database schema (prisma db push)..."
  npx prisma db push --schema=prisma/schema.prisma --skip-generate || echo "[OmniCat] Note: prisma db push skipped or connection issue"

  echo "==> [OmniCat] Checking superadmin seed..."
  tsx prisma/seed.ts || echo "[OmniCat] Note: Seed skipped (Super Admin exists or env not set)"
fi

exec "$@"
