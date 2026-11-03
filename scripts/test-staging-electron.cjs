const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'ogc-staging-ui-'));
const repo = path.join(root, 'repository');
const profile = path.join(root, 'profile');
fs.mkdirSync(repo);
fs.mkdirSync(profile);
const git = (args) => {
  const result = spawnSync('git', args, { cwd: repo, windowsHide: true, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error || 'Git failed.'));
};
try {
  git(['init', '-b', 'main']);
  for (const [key, value] of [
    ['user.name', 'Staging UI'],
    ['user.email', 'staging@example.invalid'],
    ['commit.gpgSign', 'false'],
    ['core.autocrlf', 'false'],
    ['gc.auto', '0'],
  ])
    git(['config', '--local', key, value]);
  fs.writeFileSync(path.join(repo, '.git/info/attributes'), '* -filter -text\n');
  for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(repo, `file-${i}.txt`), 'initial\n');
  git(['add', '-A']);
  git(['commit', '-m', 'UI baseline']);
  for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(repo, `file-${i}.txt`), 'modified\n');
  fs.writeFileSync(
    path.join(profile, 'settings.json'),
    JSON.stringify({
      language: 'en',
      autoUpdateEnabled: false,
      autoUpdateCheckEnabled: false,
      userNotesCheckEnabled: false,
      automaticMaintenanceEnabled: false,
    }),
  );
  fs.writeFileSync(
    path.join(profile, 'repos.json'),
    JSON.stringify({ repos: [{ path: repo, pinned: false, lastOpened: Date.now(), createdAt: Date.now() }], activeRepo: repo, sortBy: 'lastOpenedDesc' }),
  );
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    OPEN_GIT_CONTROL_API_DISABLED: 'true',
    OGC_STAGING_UI_PROFILE: profile,
    OGC_STAGING_UI_REPOSITORY: repo,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [path.join(__dirname, 'staging-electron-fixture.cjs')], {
    env,
    windowsHide: true,
    stdio: 'inherit',
    timeout: 90000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Native staging checks must succeed.');
  assert.equal(fs.readFileSync(path.join(profile, 'verified'), 'utf8'), 'yes');
} finally {
  if (path.dirname(root) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(root).startsWith('ogc-staging-ui-'))
    throw new Error('Unsafe UI test cleanup.');
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
