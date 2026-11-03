const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-tutorial-electron-test-'));
const environment = { ...process.env, OGC_TUTORIAL_TEST_PROFILE: root, OPEN_GIT_CONTROL_API_DISABLED: 'true', NODE_ENV: 'production' };
delete environment.ELECTRON_RUN_AS_NODE;
try {
  for (const fresh of ['1', '0']) {
    fs.rmSync(path.join(root, 'tutorial-verified'), { force: true });
    const result = spawnSync(require('electron'), [path.join(__dirname, 'tutorial-electron-fixture.js')], {
      env: { ...environment, OGC_TUTORIAL_TEST_FRESH: fresh },
      windowsHide: true,
      stdio: 'inherit',
      timeout: 180_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'The native tutorial smoke test must finish successfully.');
    assert.equal(fs.readFileSync(path.join(root, 'tutorial-verified'), 'utf8'), 'yes', 'Every tutorial check must complete before exit.');
  }
} finally {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-tutorial-electron-test-'))
    throw new Error('Unsafe tutorial test profile.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
