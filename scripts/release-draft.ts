import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db';

async function main() {
  const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    throw new Error(`CHANGELOG.md tidak ditemukan di ${changelogPath}`);
  }

  const raw = fs.readFileSync(changelogPath, 'utf-8');
  const unreleasedMatch = raw.match(/##\s*\[Unreleased\]([\s\S]*?)(?=##\s*\[|$)/i);

  if (!unreleasedMatch || !unreleasedMatch[1].trim()) {
    throw new Error('Tidak ditemukan konten di bawah entri ## [Unreleased] di CHANGELOG.md');
  }

  const unreleasedContent = unreleasedMatch[1].trim();

  // Versi dari argumen CLI atau default v0.2.0
  const argVersion = process.argv[2];
  const version = argVersion
    ? argVersion.startsWith('v')
      ? argVersion
      : `v${argVersion}`
    : 'v0.2.0';
  const title = process.argv[3] || `Pembaruan OmniCat ${version}`;

  const sa = await prisma.user.findFirst({
    where: { role: 'SUPERADMIN', isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (!sa) {
    throw new Error('Tidak ditemukan user Super Admin aktif di database untuk membuat draf rilis');
  }

  const draft = await prisma.releaseNote.create({
    data: {
      version,
      title,
      bodyMarkdown: unreleasedContent,
      createdById: sa.id,
      publishedAt: null, // Draft
    },
  });

  console.log(
    `[release:draft] Berhasil membuat draf rilis ${draft.version}: "${draft.title}" (ID: ${draft.id})`
  );
}

main()
  .catch((e) => {
    console.error('[release:draft] Error:', e.message);
    process.exit(1);
  });
