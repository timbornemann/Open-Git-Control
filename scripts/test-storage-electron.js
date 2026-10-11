const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// This integration test must never open the installed application's profile.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-electron-storage-test-'));
const environment = { ...process.env, OGC_STORAGE_TEST_PROFILE: root };
delete environment.ELECTRON_RUN_AS_NODE;
try {
  const seeded = spawnSync(require('electron'), [path.join(__dirname, 'storage-electron-fixture.js')], {
    env: { ...environment, OGC_STORAGE_TEST_SEED: '1' },
    windowsHide: true,
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (seeded.error) throw seeded.error;
  if (seeded.status !== 0) throw new Error('Isolated development startup failed.');
  const result = spawnSync(require('electron'), [path.join(__dirname, 'storage-electron-fixture.js')], {
    env: environment,
    windowsHide: true,
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    const development = spawnSync(require('electron'), [path.join(__dirname, 'storage-electron-fixture.js')], {
      env: { ...environment, OGC_STORAGE_TEST_CLEAR_DEV: '1' },
      windowsHide: true,
      stdio: 'inherit',
      timeout: 120_000,
    });
    if (development.error) throw development.error;
    process.exitCode = development.status ?? 1;
  }
} finally {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-electron-storage-test-'))
    throw new Error('Unsafe test profile.');
  fs.rmSync(resolved, { recursive: true, force: true });
}
