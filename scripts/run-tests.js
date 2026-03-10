const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const vitestMjs = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');

if (!fs.existsSync(vitestMjs)) {
  console.warn('[tests] vitest is not installed in node_modules. Skipping unit tests.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [vitestMjs, 'run'], {
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
