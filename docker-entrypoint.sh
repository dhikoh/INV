#!/bin/sh
set -e

# ==============================================================================
# OmniCat Docker Entrypoint Script
# Solusi AUD-SPEC-006:
# 1. Menjalankan 'prisma migrate deploy' (bukan db push) untuk menjamin trigger & CHECK constraint terpasang.
# 2. Gagal keras (exit non-zero) bila migrasi database gagal (tanpa menelan error via '|| echo').
# 3. Service 'worker' dikecualikan dari migrasi dan seeding untuk mencegah race condition.
# 4. Seeding tidak dijalankan otomatis di setiap start container, hanya bila RUN_SEED="true".
# ==============================================================================

# Deteksi apakah container ini dijalankan sebagai background worker
IS_WORKER="false"
if [ "$SERVICE_TYPE" = "worker" ]; then
  IS_WORKER="true"
fi

for arg in "$@"; do
  case "$arg" in
    *worker*)
      IS_WORKER="true"
      break
      ;;
  esac
done

if [ "$IS_WORKER" = "true" ]; then
  echo "==> [OmniCat] Starting Worker service (skipping database migrations and seeding)..."
else
  # Service Web / API
  if [ -n "$DATABASE_URL" ] && [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "==> [OmniCat] Applying production database migrations (prisma migrate deploy)..."
    npx prisma migrate deploy --schema=prisma/schema.prisma
    echo "==> [OmniCat] Database migrations applied successfully."
  fi

  if [ "$RUN_SEED" = "true" ]; then
    echo "==> [OmniCat] RUN_SEED is enabled: running initial superadmin seed..."
    tsx prisma/seed.ts
  fi
fi

exec "$@"
