import * as fs from 'fs';
import * as path from 'path';

interface ApiRouteInfo {
  file: string;
  urlPattern: string;
  roles: string[];
  responseShape: string;
}

interface FetchCall {
  sourceFile: string;
  line: number;
  url: string;
  method: string;
  accessPattern: string;
}

function findFiles(dir: string, ext: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(findFiles(full, ext));
    } else if (ext.some(e => file.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function analyzeApiRoutes(): Map<string, ApiRouteInfo> {
  const routes = new Map<string, ApiRouteInfo>();
  const apiFiles = findFiles('src/app/api/v1', ['.ts']);

  for (const file of apiFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = path.relative('src/app/api/v1', file).replace(/\\/g, '/').replace(/\/route\.ts$/, '');
    const urlPattern = `/api/v1/${rel}`;

    let roles: string[] = [];
    const rolesMatch = content.match(/roles:\s*\[([\s\S]*?)\]/);
    if (rolesMatch) {
      roles = rolesMatch[1].split(',').map(r => r.replace(/['"Role.\s]/g, '')).filter(Boolean);
    }

    let responseShape = 'unknown';
    if (content.includes('items,') || content.includes('items:')) {
      responseShape = '{ items, total }';
    } else if (content.includes('data: ') && (content.includes('findMany') || content.includes('[]'))) {
      responseShape = 'array';
    }

    routes.set(urlPattern, { file, urlPattern, roles, responseShape });
  }

  return routes;
}

function analyzeFrontendFetches(): FetchCall[] {
  const calls: FetchCall[] = [];
  const srcFiles = [
    ...findFiles('src/app/(app)', ['.tsx', '.ts']),
    ...findFiles('src/components', ['.tsx', '.ts']),
  ];

  for (const file of srcFiles) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fetchMatch = line.match(/fetch\s*\(\s*[`'"](\/api\/v1\/[^`'"]+)[`'"]/);
      if (fetchMatch) {
        let url = fetchMatch[1].split('?')[0];
        // Normalize parameterized URLs like ${id} or :id
        url = url.replace(/\${[^}]+}/g, ':id');

        // Look ahead for access pattern in the next 15 lines
        const nextLines = lines.slice(i, i + 15).join('\n');
        let accessPattern = 'unknown';
        if (nextLines.includes('.data.items')) accessPattern = '.data.items';
        else if (nextLines.includes('.data.data')) accessPattern = '.data.data';
        else if (nextLines.includes('Array.isArray(')) accessPattern = 'Array.isArray(data)';
        else if (nextLines.includes('.data')) accessPattern = '.data';

        let method = 'GET';
        if (nextLines.includes("method: 'POST'") || nextLines.includes('method: "POST"')) method = 'POST';
        else if (nextLines.includes("method: 'PATCH'") || nextLines.includes('method: "PATCH"')) method = 'PATCH';
        else if (nextLines.includes("method: 'DELETE'") || nextLines.includes('method: "DELETE"')) method = 'DELETE';

        calls.push({
          sourceFile: file.replace(/\\/g, '/'),
          line: i + 1,
          url,
          method,
          accessPattern,
        });
      }
    }
  }

  return calls;
}

const routes = analyzeApiRoutes();
const fetches = analyzeFrontendFetches();

console.log(`=== AUDIT KONTRAK UI <-> API ===`);
console.log(`Total Frontend Fetch: ${fetches.length}`);
console.log(`Total API Routes: ${routes.size}\n`);

// 1. Cek ketidakcocokan kontrak (.data.items vs array langsung)
console.log(`--- [T1] KETIDAKCOCOKAN KONTRAK RESPONSE ARRAY (.data.items) ---`);
const itemMismatch = fetches.filter(f => f.accessPattern === '.data.items');
for (const m of itemMismatch) {
  console.log(`- ${m.sourceFile}:${m.line} -> ${m.method} ${m.url} (membaca: ${m.accessPattern})`);
}

// 2. Cek endpoint khusus SA yang dipanggil halaman Sales
console.log(`\n--- [T3] POTENSI PANGGILAN 403 (SUPERADMIN ONLY DIPANGGIL HALAMAN BISA DIAKSES SALES) ---`);
for (const f of fetches) {
  // Check known SA only endpoints
  if (
    f.url === '/api/v1/users' ||
    f.url.includes('/min-prices') ||
    f.url.includes('/reports/margin') ||
    f.url.includes('/settings')
  ) {
    console.log(`- ${f.sourceFile}:${f.line} -> ${f.method} ${f.url}`);
  }
}
