const { spawn } = require('child_process');
const electron = require('electron');

// CRITICAL: Remove the environment variable that forces Electron to run as a headless Node.js instance
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.log('[Bootstrap] Detected ELECTRON_RUN_AS_NODE in environment. Unsetting it to allow normal Desktop execution...');
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code);
});
