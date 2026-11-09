#!/bin/sh
set -e

# Otomatisasi inisialisasi database jika DATABASE_URL tersedia
if [ -n "$DATABASE_URL" ]; then
  echo "==> [OmniCat] Sinkronisasi skema database (prisma db push)..."
  prisma db push --skip-generate || echo "[OmniCat] Catatan: prisma db push dilewati atau menemui kendala koneksi"

  echo "==> [OmniCat] Pengecekan seed superadmin..."
  tsx prisma/seed.ts || echo "[OmniCat] Catatan: Seed dilewati (Super Admin sudah ada atau tidak disetel)"
fi

exec "$@"
