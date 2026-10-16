const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const applicationPath = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-startup-electron-test-'));
const environment = {
  ...process.env,
  OGC_STARTUP_TEST_PROFILE: root,
  OGC_STARTUP_TEST_APP: applicationPath,
  OPEN_GIT_CONTROL_API_DISABLED: 'true',
  NODE_ENV: 'production',
};
delete environment.ELECTRON_RUN_AS_NODE;
const run = (lifecycle, repository = false) => {
  const result = spawnSync(require('electron'), [path.join(__dirname, 'startup-electron-fixture.js')], {
    env: { ...environment, OGC_STARTUP_TEST_LIFECYCLE: lifecycle ? '1' : '0', OGC_STARTUP_TEST_REPOSITORY: repository ? '1' : '0' },
    windowsHide: true,
    encoding: 'utf8',
    timeout: 45_000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `The native ${lifecycle ? 'shutdown' : 'startup'} smoke test must finish on its own.`);
  assert.ok(result.stdout.includes(lifecycle ? 'cleanup=true' : 'Application started with CSS, preload and bootstrap available.'));
  if (!lifecycle) assert.ok(fs.readFileSync(path.join(root, 'startup.log'), 'utf8').includes('shutdown-cleanup-complete'));
};
try {
  if (process.platform === 'win32' && path.basename(applicationPath) === 'app.asar') {
    const executable = path.resolve(applicationPath, '../../Open-Git-Control.exe');
    const probe = spawnSync(executable, ['-p', 'process.versions.electron'], {
      env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    });
    assert.equal(probe.status, 0, `The packaged Electron runtime must start: ${probe.stderr || probe.error || ''}`);
    assert.equal(probe.stdout.trim(), require('electron/package.json').version, 'Test the same Electron version as the packaged application.');
  }
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ autoUpdateEnabled: false, automaticMaintenanceEnabled: false }));
  run(true);
  assert.equal(fs.readFileSync(path.join(root, 'cleanup-finished'), 'utf8'), 'preserved');
  run(false);
  const repository = path.join(root, 'repository');
  fs.mkdirSync(repository);
  const git = (args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'user.name=Startup test', '-c', 'user.email=startup@example.invalid', ...args], {
      cwd: repository,
      windowsHide: true,
      timeout: 15_000,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `Cannot create the startup repository fixture: ${result.stderr || result.error || ''}`);
  };
  git(['init', '-b', 'main']);
  git(['commit', '--allow-empty', '--no-gpg-sign', '-m', 'Startup smoke test commit']);
  fs.writeFileSync(
    path.join(root, 'repos.json'),
    JSON.stringify({
      repos: [{ path: repository, lastOpened: Date.now(), pinned: false, createdAt: Date.now() }],
      activeRepo: repository,
      sortBy: 'lastOpenedDesc',
    }),
  );
  run(false, true);
  // Reuse the same profile: a remaining process or lock must not turn a second
  // launch into an empty window or silently forward it to a disposed instance.
  run(false, true);
  console.log('Native startup, shutdown and restart smoke tests passed.');
} finally {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-startup-electron-test-'))
    throw new Error('Unsafe startup test profile.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
