/**
 * Menyinkronkan `.next/static` dan `public` ke dalam `.next/standalone`,
 * memperbaiki symlink direktori rusak akibat bug Next.js standalone + pnpm di Windows,
 * serta melengkapi link biner platform `sharp` (`@img/sharp-*`) agar
 * `pnpm start:standalone` (`node .next/standalone/server.js`) berjalan mulus.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');
const serverJs = path.join(standaloneDir, 'server.js');

if (!fs.existsSync(serverJs)) {
  process.exit(0);
}

const linkType = process.platform === 'win32' ? 'junction' : 'dir';

function syncDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function linkDirIfMissing(linkPath, targetDir) {
  if (!fs.existsSync(targetDir)) return false;
  try {
    fs.lstatSync(linkPath);
    return false;
  } catch {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    const target =
      process.platform === 'win32'
        ? targetDir
        : path.relative(path.dirname(linkPath), targetDir);
    fs.symlinkSync(target, linkPath, linkType);
    return true;
  }
}

function repairBrokenWindowsSymlinks(nodeModulesDir) {
  if (process.platform !== 'win32' || !fs.existsSync(nodeModulesDir)) return 0;

  let fixed = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const lst = fs.lstatSync(full);
      if (lst.isSymbolicLink()) {
        try {
          fs.statSync(full);
        } catch {
          const target = fs.readlinkSync(full);
          const resolved = path.resolve(path.dirname(full), target);
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            fs.unlinkSync(full);
            fs.symlinkSync(resolved, full, 'junction');
            fixed++;
          }
        }
      } else if (lst.isDirectory()) {
        walk(full);
      }
    }
  }

  walk(nodeModulesDir);
  return fixed;
}

function syncStandaloneSharpAndPnpmLinks() {
  const saPnpm = path.join(standaloneDir, 'node_modules', '.pnpm');
  if (!fs.existsSync(saPnpm)) return 0;

  let linked = 0;
  const saEntries = fs.readdirSync(saPnpm);

  // 1. Pastikan semua paket biner platform sharp (@img/sharp-*, @img/sharp-libvips-*)
  // yang ikut ter-trace di `.pnpm/` tertaut ke setiap direktori peer `sharp@*`.
  const sharpDirs = saEntries.filter((e) => e.startsWith('sharp@'));
  const imgBinaryDirs = saEntries.filter(
    (e) => e.startsWith('@img+sharp-') || e.startsWith('@img+colour@')
  );

  for (const sharpDir of sharpDirs) {
    const imgScopeDir = path.join(saPnpm, sharpDir, 'node_modules', '@img');
    for (const binPkg of imgBinaryDirs) {
      const binScopeDir = path.join(saPnpm, binPkg, 'node_modules', '@img');
      if (!fs.existsSync(binScopeDir)) continue;
      for (const pkgName of fs.readdirSync(binScopeDir)) {
        const target = path.join(binScopeDir, pkgName);
        if (linkDirIfMissing(path.join(imgScopeDir, pkgName), target)) {
          linked++;
        }
      }
    }
  }

  // 2. Pulihkan symlink peer pnpm lain yang targetnya memang sudah tersalin di standalone `.pnpm`
  const rootPnpm = path.join(root, 'node_modules', '.pnpm');
  if (!fs.existsSync(rootPnpm)) return linked;

  function mirrorLink(rootLinkPath, standaloneLinkPath) {
    if (fs.existsSync(standaloneLinkPath)) return;
    try {
      const real = fs.realpathSync(rootLinkPath);
      const relFromRootPnpm = path.relative(rootPnpm, real);
      if (!relFromRootPnpm.startsWith('..')) {
        const candidate = path.join(saPnpm, relFromRootPnpm);
        if (linkDirIfMissing(standaloneLinkPath, candidate)) linked++;
      }
    } catch {
      // Abaikan symlink root yang tidak dapat di-resolve
    }
  }

  for (const pkg of saEntries) {
    const saNm = path.join(saPnpm, pkg, 'node_modules');
    const rootNm = path.join(rootPnpm, pkg, 'node_modules');
    if (!fs.existsSync(saNm) || !fs.existsSync(rootNm)) continue;

    for (const dep of fs.readdirSync(rootNm)) {
      const rootDep = path.join(rootNm, dep);
      if (dep.startsWith('@')) {
        for (const scoped of fs.readdirSync(rootDep)) {
          mirrorLink(path.join(rootDep, scoped), path.join(saNm, dep, scoped));
        }
      } else {
        mirrorLink(rootDep, path.join(saNm, dep));
      }
    }
  }

  return linked;
}

syncDir(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
syncDir(path.join(root, 'public'), path.join(standaloneDir, 'public'));
const repairedCount = repairBrokenWindowsSymlinks(path.join(standaloneDir, 'node_modules'));
const extraLinksCount = syncStandaloneSharpAndPnpmLinks();
if (repairedCount > 0 || extraLinksCount > 0) {
  console.log(
    `[prepare-standalone] Repaired ${repairedCount} Windows junctions, restored ${extraLinksCount} standalone pnpm links`
  );
}

