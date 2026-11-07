# ADR 0003: Konfigurasi Datasource Prisma 7 dan Driver Adapter PostgreSQL

## Konteks

Sistem menggunakan Prisma versi 7.10.1. Pada Prisma 7, penulisan properti `url = env("DATABASE_URL")` di dalam blok `datasource` file `schema.prisma` sudah tidak didukung lagi secara resmi dan dipindahkan ke file konfigurasi `prisma.config.ts`. Selain itu, Prisma 7 mewajibkan penggunaan driver adapter JavaScript (`@prisma/adapter-pg` bersama pool koneksi `pg`) untuk eksekusi query PostgreSQL.

Dokumen panduan ("Prompt AI Agent", Bagian 6) menyatakan:

> "Jika ada ketidakcocokan dengan versi Prisma yang terpasang (misalnya cara menulis datasource), sesuaikan sintaksnya saja, bukan isinya, dan catat sebagai ADR."

## Keputusan

1. **File prisma.config.ts**: Dibuat di root proyek untuk memetakan schema path (`prisma/schema.prisma`) dan datasource URL PostgreSQL (`process.env.DATABASE_URL`).
2. **schema.prisma**: Menghilangkan baris `url = env("DATABASE_URL")` di blok `datasource db`, tetap mempertahankan `provider = "postgresql"`.
3. **Driver Adapter**: Menggunakan `@prisma/adapter-pg` dan `pg.Pool` di `src/lib/db.ts` untuk menghubungkan `PrismaClient` ke database PostgreSQL.
4. **In-Memory Testing**: Menggunakan engine WebAssembly `@electric-sql/pglite` di lingkungan pengujian Vitest untuk menjalankan migrasi DDL lengkap, check constraints, trigger PL/pgSQL, dan partial unique indexes secara instan tanpa ketergantungan server PostgreSQL eksternal.

## Alternatif yang Ditolak

1. **Downgrade ke Prisma versi lama**: Mengabaikan pembaruan keamanan, optimasi performa WASM, dan kompatibilitas jangka panjang Node 22 LTS.
2. **Prisma Accelerate (Cloud)**: Menambah ketergantungan jaringan eksternal dan biaya cloud pihak ketiga yang tidak diinginkan dalam deploy mandiri Coolify.

## Konsekuensi

- Semua instansiasi `PrismaClient` wajib melalui helper `createPrismaClient()` di `src/lib/db.ts`.
- Migrasi database dan `prisma generate` berjalan melalui perintah CLI Prisma standar yang membaca `prisma.config.ts`.
