const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { GitService } = require('../dist-electron/electron/GitService.js');
const { WorkingTreeService } = require('../dist-electron/electron/WorkingTreeService.js');
const { assertGitWorkingTreePaths } = require('../dist-electron/electron/git/GitWorkingTreePathGuard.js');

const label = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) || 'after';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid measurement label.');
const rounds = Number(process.argv.find((arg) => arg.startsWith('--rounds='))?.slice(9) || 7);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) throw new Error('Invalid round count.');
const sizes = (process.argv.find((arg) => arg.startsWith('--sizes='))?.slice(8) || '400,10000').split(',').map(Number);
if (sizes.some((size) => !Number.isInteger(size) || size < 1 || size > 10000)) throw new Error('Invalid fixture size.');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'ogc-stage-measure-'));
const repo = path.join(root, 'repo');
const exec = promisify(execFile);
const git = async (args) => (await exec('git', args, { cwd: repo, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })).stdout;
const names = Array.from({ length: 10000 }, (_, i) => `group-${Math.floor(i / 100)}/file-${i}.txt`);
const report = { label, platform: process.platform, rounds, tracked: names.length, cases: [] };
const output = path.resolve(__dirname, `../build/staging-${label}.json`);
const save = () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
};
async function batches(items, operation) {
  for (let i = 0; i < items.length; i += 64) await Promise.all(items.slice(i, i + 64).map(operation));
}
function assertFixture() {
  if (path.dirname(root) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(root).startsWith('ogc-stage-measure-') || path.dirname(repo) !== root)
    throw new Error('Unsafe staging measurement fixture.');
}
async function prepare(kind, count) {
  assertFixture();
  await git(['reset', '--hard', '--quiet', 'HEAD']);
  await git(['clean', '-fd', '--quiet']);
  const files = kind === 'modified' ? names.slice(0, count) : names.slice(0, count).map((name) => name.replace('.txt', '-new.txt'));
  await batches(files, (name) => fs.promises.writeFile(path.join(repo, name), 'modified benchmark text\n'));
  return files;
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]), maximumMs: Math.round(sorted.at(-1)) };
}
async function main() {
  fs.mkdirSync(repo);
  fs.mkdirSync(path.join(root, 'empty-hooks'));
  await git(['init', '--quiet']);
  for (const [key, value] of [
    ['user.name', 'Staging benchmark'],
    ['user.email', 'staging@example.invalid'],
    ['core.autocrlf', 'false'],
    ['core.hooksPath', path.join(root, 'empty-hooks')],
    ['commit.gpgSign', 'false'],
    ['gc.auto', '0'],
    ['maintenance.auto', 'false'],
  ])
    await git(['config', '--local', key, value]);
  fs.writeFileSync(path.join(repo, '.git/info/attributes'), '* -filter -text\n');
  for (let i = 0; i < 100; i++) fs.mkdirSync(path.join(repo, `group-${i}`));
  await batches(names, (name) => fs.promises.writeFile(path.join(repo, name), 'initial benchmark text\n'));
  await git(['add', '-A']);
  await git(['commit', '--quiet', '-m', 'benchmark baseline']);
  const service = new GitService();
  await service.setRepoPathAsync(repo);
  const tree = new WorkingTreeService(service);
  for (const count of sizes)
    for (const kind of ['modified', 'untracked'])
      for (const mode of ['single', 'filtered', 'section', 'repository']) {
        const samples = [];
        for (let round = 0; round <= rounds; round++) {
          const files = await prepare(kind, count);
          const selected = mode === 'single' ? files.slice(0, 1) : mode === 'filtered' ? files.slice(0, Math.min(400, count)) : files;
          const started = performance.now();
          if (mode !== 'repository') {
            const staging = service.staging || service.commits;
            await staging.stagePathsAtPath(repo, selected);
          } else if (service.staging) await service.staging.stageCommandAtPath(repo, ['add', '-A']);
          else {
            await assertGitWorkingTreePaths(repo, ['add', '-A'], (args) => service.runCommandAtPath(repo, args));
            await service.runCommandAtPath(repo, ['add', '-A']);
          }
          const mutationMs = performance.now() - started;
          const refreshStart = performance.now();
          if (typeof tree.getStatus === 'function') await tree.getStatus(repo);
          else await tree.getSnapshot(repo);
          const statusMs = performance.now() - refreshStart;
          const snapshotStart = performance.now();
          await tree.getSnapshot(repo);
          const snapshotMs = performance.now() - snapshotStart;
          await prepare(kind, count);
          const pathspec = path.join(root, 'selection.nul');
          fs.writeFileSync(pathspec, selected.map((name) => ':(literal)' + name).join('\0') + '\0');
          const directStart = performance.now();
          await git(mode === 'repository' ? ['add', '-A'] : ['add', `--pathspec-from-file=${pathspec}`, '--pathspec-file-nul']);
          if (round) samples.push({ mutationMs, statusMs, visibleMs: mutationMs + statusMs, snapshotMs, directGitMs: performance.now() - directStart });
        }
        const summary = Object.fromEntries(
          ['mutationMs', 'statusMs', 'visibleMs', 'snapshotMs', 'directGitMs'].map((key) => [key, summarize(samples.map((sample) => sample[key]))]),
        );
        report.cases.push({ count, kind, mode, summary, samples });
        save();
        console.log(JSON.stringify({ count, kind, mode, ...summary }));
      }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    assertFixture();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
