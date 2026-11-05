const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
function git(repo, args, overrides = {}) {
  const child = spawnSync('git', args, { cwd: repo, env: { ...process.env, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  return child.stdout;
}
async function electronProbe() {
  const { app } = require('electron');
  const root = process.env.OGC_REBASE_MESSAGE_PROBE_ROOT;
  app.setPath('userData', path.join(root, 'profile'));
  await app.whenReady();
  const { GitRunner } = require(path.join(project, 'dist-electron/electron/git/GitRunner.js'));
  const { RebaseService } = require(path.join(project, 'dist-electron/electron/git/RebaseService.js'));
  const runner = new GitRunner();
  const cases = JSON.parse(fs.readFileSync(path.join(root, 'fixtures.json'), 'utf8'));
  try {
    for (const entry of cases) {
      const service = new RebaseService(() => entry.repo, runner);
      const [second, third] = entry.commits;
      const todo = entry.pause
        ? ['edit ' + second.hash + ' existing title', 'reword ' + third.hash + ' ' + third.nextTitle]
        : ['reword ' + second.hash.slice(0, 7) + ' ' + second.nextTitle, 'reword ' + third.hash.slice(0, 7) + ' ' + third.nextTitle];
      await service.startInteractiveRebase(entry.base, todo);
      if (entry.pause) {
        assert.ok(fs.existsSync(path.join(entry.repo, '.git/rebase-merge/ogc-reword-0.txt')));
        await service.continueRebase();
      }
      const selected = entry.pause
        ? [['HEAD', third]]
        : [
            ['HEAD~1', second],
            ['HEAD', third],
          ];
      for (const [ref, expected] of selected) {
        assert.equal(git(entry.repo, ['show', '-s', '--format=%s', ref]).trim(), expected.nextTitle);
        assert.equal(git(entry.repo, ['show', '-s', '--format=%b', ref]).trimEnd(), expected.body);
        assert.equal(git(entry.repo, ['show', '-s', '--format=%an%n%ae%n%aI', ref]), expected.author);
      }
      assert.equal(git(entry.repo, ['rev-parse', 'HEAD^{tree}']).trim(), entry.tree);
      assert.equal(git(entry.repo, ['status', '--porcelain']), '');
      assert.equal(git(entry.repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');
      assert.equal(git(entry.repo, ['rev-parse', 'saved-message']).trim(), second.hash);
      for (const original of entry.commits) assert.equal(git(entry.repo, ['show', '-s', '--format=%b', original.hash]).trimEnd(), original.body);
      assert.equal(fs.existsSync(path.join(entry.repo, '.git/rebase-merge')), false);
    }
    fs.writeFileSync(path.join(root, 'outcome.json'), JSON.stringify({ ok: true, cases: cases.map((entry) => entry.id) }));
  } finally {
    await runner.close();
  }
  app.quit();
}
async function run() {
  const tempRoot = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, 'ogc-rebase-electron-'));
  const target = path.resolve(root);
  assert.equal(path.dirname(target), path.resolve(tempRoot));
  assert.ok(path.basename(target).startsWith('ogc-rebase-electron-'));
  const config = path.join(root, 'empty-config'),
    hooks = path.join(root, 'empty-hooks');
  fs.writeFileSync(config, '');
  fs.mkdirSync(hooks);
  fs.mkdirSync(path.join(root, 'profile'));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')));
  environment.GIT_CONFIG_GLOBAL = config;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  delete environment.ELECTRON_RUN_AS_NODE;
  environment.OGC_REBASE_MESSAGE_PROBE_ROOT = root;
  environment.NODE_ENV = 'production';
  try {
    const cases = [];
    for (const [language, pause] of [
      ['de', false],
      ['en', true],
    ]) {
      const repo = path.join(root, 'repo with spaces ' + language);
      fs.mkdirSync(repo);
      const command = (args) => git(repo, ['-c', 'core.hooksPath=' + hooks, '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], environment);
      command(['init', '-b', 'main']);
      for (const [key, value] of [
        ['user.name', 'Sam Beispiel'],
        ['user.email', 'sam@example.invalid'],
        ['core.hooksPath', hooks],
        ['commit.gpgsign', 'false'],
        ['core.autocrlf', 'false'],
        ['gc.auto', '0'],
        ['maintenance.auto', 'false'],
      ])
        command(['config', '--local', key, value]);
      const file = path.join(repo, 'README.md');
      fs.writeFileSync(file, 'base\n');
      command(['add', 'README.md']);
      command(['commit', '-m', 'base']);
      const base = command(['rev-parse', 'HEAD']).trim();
      const commits = [];
      for (const number of [2, 3]) {
        fs.appendFileSync(file, 'line ' + number + '\n');
        const body =
          (language === 'de' ? 'Beschreibung ' : 'Description ') + number + '\n\n# Keep this paragraph.\n\nSigned-off-by: Sam Beispiel <sam@example.invalid>';
        command(['commit', '--cleanup=verbatim', '-am', 'old title ' + number, '-m', body]);
        const hash = command(['rev-parse', 'HEAD']).trim();
        commits.push({
          hash,
          body,
          author: command(['show', '-s', '--format=%an%n%ae%n%aI', hash]),
          nextTitle: (language === 'de' ? 'docs: Oberfläche genauer erklären ' : 'docs: clarify the interface ') + number,
        });
      }
      command(['tag', 'saved-message', commits[0].hash]);
      command(['config', '--local', 'commit.cleanup', 'strip']);
      cases.push({
        id: language + (pause ? '-edit-pause' : '-multiple-abbreviated'),
        repo,
        base,
        commits,
        pause,
        tree: command(['rev-parse', 'HEAD^{tree}']).trim(),
      });
    }
    fs.writeFileSync(path.join(root, 'fixtures.json'), JSON.stringify(cases));
    const log = path.join(root, 'electron.log'),
      descriptor = fs.openSync(log, 'w');
    let result;
    try {
      result = spawnSync(require('electron'), [__filename], { env: environment, stdio: ['ignore', descriptor, descriptor], windowsHide: true, timeout: 60000 });
    } finally {
      fs.closeSync(descriptor);
    }
    if (result.error || result.status !== 0) process.stdout.write(fs.readFileSync(log, 'utf8'));
    assert.equal(result.status, 0, result.error?.message);
    const outcome = JSON.parse(fs.readFileSync(path.join(root, 'outcome.json'), 'utf8'));
    assert.equal(outcome.ok, true);
    assert.deepEqual(
      outcome.cases,
      cases.map((entry) => entry.id),
    );
    console.log('Native Electron reword message, author, literal comment/signoff, abbreviated-hash and edit-pause checks passed.');
  } finally {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
void (process.versions.electron ? electronProbe() : run()).catch((error) => {
  console.error(error);
  if (process.versions.electron) require('electron').app.exit(1);
  else process.exitCode = 1;
});
