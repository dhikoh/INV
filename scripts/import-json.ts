import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Muat .env lokal bila belum dimuat ke environment
function loadEnvFileIfPresent() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFileIfPresent();

function sanitizeDbUrl(rawUrl?: string): string {
  if (!rawUrl) return 'Database PostgreSQL';
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return 'Database PostgreSQL';
  }
}

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
================================================================
📦 OMNICAT DATA IMPORT TOOL (CLI)
================================================================
Penggunaan:
  pnpm tsx scripts/import-json.ts <berkas.zip> [opsi]

Opsi:
  --dry-run                 Simulasi impor penuh dengan rollback (tanpa mengubah database & disk)
  --ganti-superadmin-seed   Ganti akun Super Admin bawaan seed jika ada di database target
  --pulihkan-berkas         Hanya pulihkan berkas uploads yang belum ada di disk (tanpa menyentuh DB)
  --yes                     Lewati konfirmasi ketik 'IMPOR' untuk eksekusi non-interaktif
================================================================
`);
    process.exit(0);
  }

  const zipPath = args.find((a) => !a.startsWith('--'));
  if (!zipPath) {
    console.error('❌ Error: Berkas ZIP target wajib disertakan.');
    process.exit(1);
  }

  const resolvedZipPath = path.resolve(process.cwd(), zipPath);
  if (!fs.existsSync(resolvedZipPath)) {
    console.error(`❌ Error: Berkas tidak ditemukan: ${resolvedZipPath}`);
    process.exit(1);
  }

  // Muat modul aplikasi setelah .env dipastikan terisi
  const { env } = await import('../src/lib/env');
  const { importData, restoreUploadsOnly } = await import('../src/lib/transfer/import');

  const dryRun = args.includes('--dry-run');
  const replaceSeedSuperadmin = args.includes('--ganti-superadmin-seed');
  const pulihkanBerkas = args.includes('--pulihkan-berkas');
  const autoYes = args.includes('--yes');

  // Validasi ukuran berkas fisik awal
  const stat = fs.statSync(resolvedZipPath);
  const sizeMb = stat.size / (1024 * 1024);
  const maxMb = env.TRANSFER_MAX_MB;

  console.log('================================================================');
  console.log('📦 OMNICAT DATA IMPORT TOOL (CLI)');
  console.log('================================================================');
  console.log(`Berkas      : ${resolvedZipPath} (${sizeMb.toFixed(2)} MB)`);
  console.log(`Target DB   : ${sanitizeDbUrl(env.DATABASE_URL)}`);
  console.log(`Upload Dir  : ${env.UPLOAD_DIR}`);
  console.log(`Mode        : ${dryRun ? 'DRY-RUN (Simulasi Rollback)' : pulihkanBerkas ? 'PULIHKAN BERKAS SAJA' : 'IMPOR EKSEKUSI NYATA'}`);
  console.log('================================================================');

  if (sizeMb > maxMb) {
    console.error(
      `❌ Error: Ukuran berkas (${sizeMb.toFixed(1)} MB) melebihi batas TRANSFER_MAX_MB (${maxMb} MB).`
    );
    process.exit(1);
  }

  // Konfirmasi sebelum eksekusi nyata
  if (!dryRun && !pulihkanBerkas && !autoYes) {
    console.log('⚠️  PERHATIAN: Tindakan ini akan menyisipkan data ke database target.');
    const confirmation = await promptUser('Ketik "IMPOR" (huruf besar) untuk melanjutkan: ');
    if (confirmation !== 'IMPOR') {
      console.log('Operasi dibatalkan oleh pengguna.');
      process.exit(0);
    }
  }

  const zipBytes = fs.readFileSync(resolvedZipPath);

  if (pulihkanBerkas) {
    console.log('⏳ Memulihkan berkas uploads fisik...');
    const report = await restoreUploadsOnly(zipBytes, env.UPLOAD_DIR);
    console.log('\n--- LAPORAN PEMULIHAN BERKAS ---');
    console.log(`Status        : ${report.ok ? '✅ SUKSES' : '❌ GAGAL'}`);
    console.log(`Total Berkas  : ${report.uploads.files}`);
    console.log(`Ditulis       : ${report.uploads.written}`);
    console.log(`Dilewati      : ${report.uploads.skipped}`);
    if (report.uploads.failed.length > 0) {
      console.log(`Gagal         : ${report.uploads.failed.join(', ')}`);
    }
    if (report.warnings.length > 0) {
      console.log('\nPeringatan:');
      report.warnings.forEach((w) => console.log(`  - ⚠️  ${w}`));
    }
    if (report.errors.length > 0) {
      console.log('\nError:');
      report.errors.forEach((e) => console.log(`  - ❌ ${e}`));
    }
    process.exit(report.ok ? 0 : 1);
  }

  console.log('⏳ Memproses impor data...');
  const report = await importData(zipBytes, {
    dryRun,
    replaceSeedSuperadmin,
    actor: null,
    uploadDir: env.UPLOAD_DIR,
  });

  console.log('\n================================================================');
  console.log(`HASIL IMPOR: ${report.ok ? (dryRun ? '✅ SIMULASI LULUS (DRY-RUN)' : '✅ IMPOR BERHASIL') : '❌ IMPOR GAGAL'}`);
  console.log('================================================================');
  console.log(`Cakupan Data : ${report.scope.toUpperCase()}`);
  if (report.manifest) {
    console.log(`Versi Asal   : ${report.manifest.appVersion}`);
    console.log(`Waktu Ekspor : ${report.manifest.exportedAt}`);
    console.log(`Kode Usaha   : ${report.manifest.businessCodes.join(', ') || '-'}`);
  }

  console.log('\nData Tabel Tersisip:');
  const tableEntries = Object.entries(report.counts);
  if (tableEntries.length === 0) {
    console.log('  (Tidak ada baris data yang dimasukkan)');
  } else {
    for (const [tbl, count] of tableEntries) {
      console.log(`  - ${tbl.padEnd(25)} : ${count} baris`);
    }
  }

  console.log('\nBerkas Uploads:');
  console.log(`  - Total Berkas : ${report.uploads.files}`);
  console.log(`  - Ditulis      : ${report.uploads.written}`);
  console.log(`  - Dilewati     : ${report.uploads.skipped}`);
  if (report.uploads.failed.length > 0) {
    console.log(`  - Gagal        : ${report.uploads.failed.join(', ')}`);
  }

  if (report.warnings.length > 0) {
    console.log('\nPeringatan (Warnings):');
    report.warnings.forEach((w) => console.log(`  - ⚠️  ${w}`));
  }

  if (report.errors.length > 0) {
    console.log('\nError:');
    report.errors.forEach((e) => console.log(`  - ❌ ${e}`));
  }

  console.log('================================================================');
  process.exit(report.ok ? 0 : 1);
}

main().catch((err: Error) => {
  console.error('\n❌ Terjadi kesalahan tak terduga:', err.message);
  process.exit(1);
});
