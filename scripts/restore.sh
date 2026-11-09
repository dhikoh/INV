#!/usr/bin/env bash
# ==============================================================================
# BentoCat / OmniCat - Database & Storage Restore Script (Seksi 3.4 & Seksi 18.1 no. 38)
#
# Memulihkan database PostgreSQL dari arsip dump serta memulihkan volume /data/uploads.
# Memastikan urutan DocumentCounter dan AuditLog tetap utuh dan berlanjut tanpa collision.
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Penggunaan: $0 <path_to_db_dump> [path_to_uploads_tar_gz]" >&2
  echo "Contoh:     $0 /data/backups/db_bentocat_20261109_120000.dump /data/backups/uploads_bentocat_20261109_120000.tar.gz" >&2
  exit 1
fi

DB_DUMP_FILE="$1"
UPLOADS_ARCHIVE="${2:-}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: Variabel DATABASE_URL belum disetel." >&2
  exit 1
fi

if [ ! -f "$DB_DUMP_FILE" ]; then
  echo "Error: Berkas dump database tidak ditemukan: $DB_DUMP_FILE" >&2
  exit 1
fi

echo "=== Memulai Pemulihan (Restore) BentoCat ==="
echo "Sumber Database Dump : $DB_DUMP_FILE"

# 1. Restore Database PostgreSQL
echo "1. Memulihkan database PostgreSQL..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DB_DUMP_FILE"
echo "   Database berhasil dipulihkan."

# 2. Restore Volume Uploads
if [ -n "$UPLOADS_ARCHIVE" ]; then
  if [ -f "$UPLOADS_ARCHIVE" ]; then
    echo "2. Memulihkan berkas storage uploads..."
    mkdir -p "$(dirname "$UPLOADS_DIR")"
    tar -xzf "$UPLOADS_ARCHIVE" -C "$(dirname "$UPLOADS_DIR")"
    echo "   Berkas uploads berhasil dipulihkan ke: $UPLOADS_DIR"
  else
    echo "Peringatan: Berkas arsip uploads tidak ditemukan: $UPLOADS_ARCHIVE (dilewati)" >&2
  fi
else
  echo "2. Berkas arsip uploads tidak disertakan (dilewati)."
fi

# 3. Jalankan migrasi jika ada schema baru yang belum di-apply
echo "3. Menjalankan sinkronisasi migrasi skema..."
pnpm prisma migrate deploy

echo "=== Pemulihan Selesai dengan Sukses ==="

