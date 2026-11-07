const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');
if (fs.existsSync(nextDir)) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
  } catch (err) {
    // ignore
  }
}
