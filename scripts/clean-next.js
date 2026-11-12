const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');
if (fs.existsSync(nextDir)) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (err) {
    console.error(
      `[clean-next] Gagal menghapus .next (${err.code || err.message}). Pastikan tidak ada proses 'next start' / 'server.js' yang masih berjalan.`
    );
    process.exit(1);
  }
}
