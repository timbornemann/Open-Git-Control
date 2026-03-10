const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = [npmCmd, 'exec', '--', 'vitest', 'run', ...args].join(' ');
const result = spawnSync(command, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error(`[tests] Failed to execute vitest: ${result.error.message}`);
}

process.exit(1);