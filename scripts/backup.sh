#!/usr/bin/env bash
# ==============================================================================
# BentoCat / OmniCat - Automated Daily Backup Script (Seksi 3.4 & Seksi 18.1 no. 38)
#
# Mem-backup database PostgreSQL (termasuk DocumentCounter, AuditLog, & semua tabel usaha)
# serta volume berkas /data/uploads ke dalam arsip terkompresi berstempel waktu.
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: Variabel DATABASE_URL belum disetel." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

DB_BACKUP_FILE="${BACKUP_DIR}/db_bentocat_${TIMESTAMP}.sql.gz"
UPLOADS_BACKUP_FILE="${BACKUP_DIR}/uploads_bentocat_${TIMESTAMP}.tar.gz"

echo "=== Memulai Backup BentoCat [${TIMESTAMP}] ==="

# 1. Backup PostgreSQL via pg_dump
echo "1. Mengekspor database PostgreSQL..."
pg_dump "$DATABASE_URL" --format=custom --compress=9 --file="${BACKUP_DIR}/db_bentocat_${TIMESTAMP}.dump"
echo "   Database berhasil diekspor: ${BACKUP_DIR}/db_bentocat_${TIMESTAMP}.dump"

# 2. Backup Volume Berkas Uploads (bila ada)
if [ -d "$UPLOADS_DIR" ] && [ "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  echo "2. Mengompresi direktori berkas uploads (${UPLOADS_DIR})..."
  tar -czf "$UPLOADS_BACKUP_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "   Arsip berkas uploads berhasil dibuat: ${UPLOADS_BACKUP_FILE}"
else
  echo "2. Direktori uploads kosong atau belum ada berkas fisik; melewati backup uploads."
fi

# 3. Retensi Backup: Simpan backup 30 hari terakhir, hapus yang lebih lama
echo "3. Membersihkan berkas backup berumur lebih dari 30 hari..."
find "$BACKUP_DIR" -type f \( -name "db_bentocat_*.dump" -o -name "uploads_bentocat_*.tar.gz" \) -mtime +30 -delete || true

echo "=== Backup Selesai dengan Sukses [${TIMESTAMP}] ==="

