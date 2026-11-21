import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultExecFileAsyncRunner, GitRunner } from '../GitRunner';
import { BranchBackupService } from '../BranchBackupService';
import { BranchBundleStore, readBranchTips } from '../branchBundles';
import { describeBranchRepository } from '../branchRecoveryRepository';
import { BranchRecoveryService } from '../BranchRecoveryService';
import { BranchRepairSnapshots } from '../BranchRepairSnapshots';
import { BranchTipJournal } from '../BranchTipJournal';
import { RepositoryHeadService } from '../RepositoryHeadService';
import { configureFixtureRepository } from './gitFixtureHistory';

const tempDirectory = fs.realpathSync.native(os.tmpdir());
let root: string;
let repo: string;
let backupDir: string;
let runner: GitRunner;
let tips: BranchTipJournal;
let heads: RepositoryHeadService;
let bundles: BranchBundleStore;
let snapshots: BranchRepairSnapshots;
let recovery: BranchRecoveryService;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trimEnd();
const index = (gitDir: string) => fs.readFileSync(path.join(gitDir, 'index'));
const refFile = (ref = 'refs/heads/main') => path.join(repo, '.git', ref);
const noSignal = () => new AbortController().signal;
const ensureActive = () => {};

function commit(subject: string, cwd = repo) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', subject);
  return git(cwd, 'rev-parse', 'HEAD');
}

beforeEach(() => {
  // Bundle storage expects the same canonical path that the destination picker supplies.
  root = fs.mkdtempSync(path.join(tempDirectory, 'ogc-branch-repair-test-'));
  repo = path.join(root, 'repo');
  backupDir = path.join(root, 'backup-disk');
  fs.mkdirSync(repo);
  fs.mkdirSync(backupDir);
  const global = path.join(root, 'empty.gitconfig');
  fs.writeFileSync(global, '');
  vi.stubEnv('GIT_CONFIG_GLOBAL', global);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  git(repo, 'init', '-b', 'main');
  configureFixtureRepository(repo, 'Recovery Fixture', 'fixture@example.invalid');
  runner = new GitRunner();
  tips = new BranchTipJournal(path.join(root, 'tips'), runner);
  heads = new RepositoryHeadService(runner, { previousTip: (layout, ref) => tips.previousTip(layout, ref) });
  bundles = new BranchBundleStore(runner);
  snapshots = new BranchRepairSnapshots(path.join(root, 'repair-snapshots'));
  recovery = new BranchRecoveryService(runner, heads, tips, { bundles, versions: (layout) => bundles.versions(backupDir, layout) }, snapshots);
});

afterEach(async () => {
  await runner?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (path.dirname(path.resolve(root)) !== tempDirectory || !path.basename(root).startsWith('ogc-branch-repair-test-'))
    throw new Error('Invalid fixture directory.');
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('repository branch crash recovery', () => {
  it('recovers 41 NUL bytes with 335 index entries and an older remote ref', async () => {
    for (let number = 0; number < 335; number++) fs.writeFileSync(path.join(repo, `file-${number}.txt`), 'original');
    const previous = commit('Original history');
    git(repo, 'update-ref', 'refs/remotes/origin/main', previous);
    fs.writeFileSync(path.join(repo, 'file-0.txt'), 'Passkey change');
    const oid = commit('Passkey commit');
    const originalIndex = index(path.join(repo, '.git'));
    fs.writeFileSync(refFile(), Buffer.alloc(41));
    expect(git(repo, '--no-optional-locks', 'status', '--porcelain=v2', '--branch')).toContain('# branch.oid (initial)');
    await expect(heads.read(repo)).rejects.toMatchObject({ problem: { reason: 'broken-ref', ref: 'refs/heads/main' } });
    await expect(heads.status(repo)).rejects.toMatchObject({ problem: { reason: 'broken-ref' } });
    const plan = (await recovery.inspect(repo))!;
    expect(plan.inspection.candidates).toEqual([
      expect.objectContaining({ oid, sources: ['branch-reflog', 'head-reflog'], indexMatch: { matches: true, entries: 335 } }),
    ]);
    await expect(recovery.repair(plan, oid, ensureActive)).resolves.toEqual({ oid });
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(oid);
    expect(git(repo, 'rev-list', '--count', '--all')).toBe('2');
    expect(git(repo, 'rev-parse', 'origin/main')).toBe(previous);
    expect((await heads.status(repo)).status).toBe('');
    expect(index(path.join(repo, '.git'))).toEqual(originalIndex);
    expect(await snapshots.list()).toEqual([expect.objectContaining({ reference: 'refs/heads/main', objectId: oid, kind: 'branch-repair' })]);
  }, 30_000);

  it('distinguishes an initial branch from a missing ref and preserves a linked worktree index and files', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'first');
    expect(await heads.read(repo)).toEqual({ kind: 'unborn', ref: 'refs/heads/main' });
    const oid = commit('Initial');
    const worktree = path.join(root, 'linked worktree');
    git(repo, 'worktree', 'add', '-b', 'feature/local', worktree);
    const gitDir = git(worktree, 'rev-parse', '--absolute-git-dir');
    fs.writeFileSync(path.join(worktree, 'file.txt'), 'staged');
    git(worktree, 'add', 'file.txt');
    fs.writeFileSync(path.join(worktree, 'file.txt'), 'unstaged');
    fs.writeFileSync(path.join(worktree, 'new.txt'), 'untracked');
    const status = git(worktree, '--no-optional-locks', 'status', '--porcelain=v1', '-z');
    expect((await heads.status(worktree)).status).toBe(status);
    const savedIndex = index(gitDir);
    fs.unlinkSync(refFile('refs/heads/feature/local'));
    const plan = (await recovery.inspect(worktree))!;
    expect(plan.inspection.problem).toMatchObject({ reason: 'missing-ref', ref: 'refs/heads/feature/local' });
    expect(plan.inspection.candidates[0]).toMatchObject({ oid, indexMatch: { matches: false, entries: 1 } });
    await expect(recovery.repair(plan, oid, ensureActive)).resolves.toEqual({ oid });
    expect(index(gitDir)).toEqual(savedIndex);
    expect(fs.readFileSync(path.join(worktree, 'file.txt'), 'utf8')).toBe('unstaged');
    expect(fs.readFileSync(path.join(worktree, 'new.txt'), 'utf8')).toBe('untracked');
    expect((await heads.status(worktree)).status).toBe(status);
  }, 30_000);

  it('restores the exact missing object from an independent bundle', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'initial');
    commit('Initial');
    fs.writeFileSync(path.join(repo, 'file.txt'), 'local');
    const oid = commit('Unpublished commit');
    const layout = await describeBranchRepository(runner, repo);
    const refs = await readBranchTips(runner, layout);
    const version = await bundles.create(backupDir, layout, refs, noSignal());
    expect(version.refs).toEqual({ 'refs/heads/main': oid });
    const rawRef = fs.readFileSync(refFile());
    fs.unlinkSync(path.join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2)));
    const plan = (await recovery.inspect(repo))!;
    expect(plan.inspection.problem).toMatchObject({ reason: 'missing-commit', targetOid: oid });
    expect(plan.inspection.candidates[0]).toMatchObject({ oid, sources: expect.arrayContaining(['bundle']) });
    await expect(recovery.repair(plan, oid, ensureActive)).resolves.toEqual({ oid });
    expect(fs.readFileSync(refFile())).toEqual(rawRef);
    expect((await heads.status(repo)).status).toBe('');
  }, 30_000);

  it('shows conflicting sources and refuses stale, locked and cancelled reviews', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'original');
    const previous = commit('Original');
    const layout = await describeBranchRepository(runner, repo);
    await tips.record(layout, { 'refs/heads/main': previous }, Date.now());
    fs.writeFileSync(path.join(repo, 'file.txt'), 'later');
    const oid = commit('Later');
    fs.writeFileSync(refFile(), Buffer.alloc(41));
    const plan = (await recovery.inspect(repo))!;
    expect(plan.inspection.candidates.map((candidate) => candidate.oid)).toEqual([oid, previous]);
    await expect(
      recovery.repair(plan, oid, () => {
        throw new Error('Repository changed');
      }),
    ).rejects.toThrow('Repository changed');
    fs.writeFileSync(`${refFile()}.lock`, 'external lock');
    await expect(recovery.repair(plan, oid, ensureActive)).rejects.toThrow();
    expect(fs.readFileSync(`${refFile()}.lock`, 'utf8')).toBe('external lock');
    expect(fs.readFileSync(refFile())).toEqual(Buffer.alloc(41));
    fs.unlinkSync(`${refFile()}.lock`);
    fs.writeFileSync(refFile(), Buffer.alloc(40));
    await expect(recovery.repair(plan, oid, ensureActive)).rejects.toThrow('changed');
    expect(fs.readFileSync(refFile())).toEqual(Buffer.alloc(40));
  }, 30_000);

  it('uses exact file checks on a Git version without show-ref --exists', async () => {
    const invoke = runner.runResult.bind(runner);
    vi.spyOn(runner, 'runResult').mockImplementation((cwd, args, options) =>
      args[0] === 'show-ref' && args[1] === '--exists'
        ? Promise.resolve({ exitCode: 129, stdout: '', stderr: "error: unknown option `exists'" })
        : invoke(cwd, args, options),
    );
    expect(await heads.read(repo)).toEqual({ kind: 'unborn', ref: 'refs/heads/main' });
    fs.writeFileSync(path.join(repo, 'file.txt'), 'original');
    commit('Initial');
    fs.writeFileSync(refFile(), Buffer.alloc(41));
    await expect(heads.read(repo)).rejects.toMatchObject({ problem: { reason: 'broken-ref' } });
  }, 20_000);

  it('recognizes a missing tip from the saved branch identity without reflogs', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'first');
    const oid = commit('Saved branch');
    const layout = await describeBranchRepository(runner, repo);
    await tips.record(layout, { 'refs/heads/main': oid }, Date.now());
    fs.unlinkSync(path.join(layout.commonDir, 'logs', 'refs', 'heads', 'main'));
    fs.unlinkSync(path.join(layout.gitDir, 'logs', 'HEAD'));
    fs.unlinkSync(refFile());
    const plan = (await recovery.inspect(repo))!;
    expect(plan.inspection.problem.reason).toBe('missing-ref');
    expect(plan.inspection.candidates).toMatchObject([{ oid, sources: ['last-seen'] }]);
  }, 20_000);

  it('reports lookup errors when Git cannot establish whether the branch exists', async () => {
    const invoke = runner.runResult.bind(runner);
    vi.spyOn(runner, 'runResult').mockImplementation((cwd, args, options) =>
      args[0] === 'show-ref' && args[1] === '--exists'
        ? Promise.resolve({ exitCode: 1, stdout: '', stderr: 'error: failed to look up reference: Permission denied' })
        : invoke(cwd, args, options),
    );
    await expect(heads.read(repo)).rejects.toMatchObject({
      problem: { reason: 'unverifiable', repairable: false, detail: expect.stringContaining('Permission denied') },
    });
  }, 20_000);
});

describe('global branch bundles', () => {
  it('publishes independent versions and retains three after the fourth', async () => {
    const layout = await describeBranchRepository(runner, repo);
    const oids = [];
    for (let version = 0; version < 4; version++) {
      fs.writeFileSync(path.join(repo, 'file.txt'), String(version));
      oids.push(commit(`Version ${version}`));
      await bundles.create(backupDir, layout, await readBranchTips(runner, layout), noSignal());
      await bundles.retainLatest(backupDir, layout);
    }
    const versions = await bundles.versions(backupDir, layout);
    expect(versions.map(({ refs }) => refs['refs/heads/main'])).toEqual(oids.slice(1).reverse());
    for (const version of versions) {
      await bundles.withVerifiedBundle(version, layout, noSignal(), async (directory) => {
        expect(git(directory, 'rev-parse', 'refs/heads/main')).toBe(version.refs['refs/heads/main']);
      });
    }
    fs.appendFileSync(versions[0].file, 'corruption');
    await expect(bundles.withVerifiedBundle(versions[0], layout, noSignal(), async () => {})).rejects.toThrow('checksum');
    expect(await bundles.versions(backupDir, layout)).toHaveLength(3);
  }, 55_000);

  it('backs up the selected repositories and preserves the selection across restart', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'first');
    commit('Initial');
    const second = path.join(root, 'second');
    git(root, 'clone', '--quiet', repo, second);
    const start = () => new BranchBackupService(path.join(root, 'profile'), runner, heads, tips, () => [repo, second]);
    let service = start();
    try {
      expect(await service.overview()).toMatchObject({ enabled: false, directory: path.join(root, 'profile', 'Repository-Backups'), versionCount: 0 });
      await expect(service.chooseDirectory(repo)).rejects.toThrow('outside');
      await service.chooseDirectory(backupDir);
      await service.setSelection({ automatic: true, repoPath: repo });
      await service.enable(true);
      await vi.waitFor(async () => expect((await service.overview()).repositories[0].verifiedAt).toBeTruthy(), { timeout: 20_000 });
      expect((await service.overview()).repositories.map(({ automatic, versions }) => [automatic, versions.length])).toEqual([
        [true, 1],
        [false, 0],
      ]);
      await service.setSelection({ automatic: true });
      await vi.waitFor(async () => expect((await service.overview()).repositories.every((record) => record.verifiedAt)).toBe(true), { timeout: 20_000 });
      const cleared = await service.setSelection({ automatic: false });
      expect(cleared.repositories.every((record) => !record.automatic)).toBe(true);
      expect(cleared.versionCount).toBe(2);
      await service.setSelection({ automatic: true });
      await service.enable(false);
      await service.dispose();
      const disconnected = path.join(root, 'removed destination');
      fs.renameSync(backupDir, disconnected);
      service = start();
      await service.enable(true);
      await vi.waitFor(
        async () => expect((await service.overview()).repositories.every((record) => record.automatic && record.verifiedAt && record.lastError)).toBe(true),
        {
          timeout: 20_000,
        },
      );
    } finally {
      await service.dispose();
    }
  }, 50_000);

  it('retries an automatic backup interrupted by a Git write', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'first');
    const oid = commit('Initial');
    let bundleAttempts = 0;
    const backupRunner = new GitRunner(async (file, args, options) => {
      if (args[0] === 'bundle' && args[1] === 'create' && ++bundleAttempts === 1) {
        const signal = options.signal!;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return defaultExecFileAsyncRunner(file, args, options);
    });
    const backupHeads = new RepositoryHeadService(backupRunner);
    const service = new BranchBackupService(path.join(root, 'profile'), backupRunner, backupHeads, tips, () => [repo]);
    try {
      await service.setSelection({ automatic: true, repoPath: repo });
      await service.enable(true);
      await vi.waitFor(() => expect(bundleAttempts).toBe(1), { timeout: 10_000 });
      await backupRunner.run(repo, ['update-ref', 'refs/heads/feature', oid]);
      expect(backupRunner.getSchedulerDiagnostics()).toContainEqual(expect.objectContaining({ command: 'bundle', kind: 'preflight', aborted: true }));

      await vi.waitFor(async () => expect((await service.overview()).repositories[0].busy).toBe(false));
      expect(await service.overview()).toMatchObject({ versionCount: 0, repositories: [{ lastError: null }] });
      await vi.waitFor(async () => expect((await service.overview()).versionCount).toBe(1), { timeout: 15_000 });
      expect(bundleAttempts).toBe(2);
      const layout = await describeBranchRepository(backupRunner, repo);
      const [version] = await service.versions(layout);
      expect(version?.refs).toEqual({ 'refs/heads/main': oid, 'refs/heads/feature': oid });
    } finally {
      await service.dispose();
      await backupRunner.close();
    }
  }, 35_000);

  it('creates a manual backup at the default destination and manages saved versions after the repository is removed', async () => {
    const profile = path.join(root, 'profile');
    const registered = [repo];
    const service = new BranchBackupService(profile, runner, heads, tips, () => registered);
    try {
      fs.writeFileSync(path.join(repo, 'file.txt'), 'first');
      commit('Initial');
      await expect(service.backupNow(backupDir)).rejects.toThrow('registered');
      await expect(service.backupNow(repo)).resolves.toBe('created');
      await expect(service.backupNow(repo)).resolves.toBe('up-to-date');
      const first = await service.overview();
      expect(first).toMatchObject({ enabled: false, versionCount: 1, directory: path.join(profile, 'Repository-Backups') });
      expect(first.totalBytes).toBe(first.repositories[0].versions[0].bytes);
      expect(first.totalBytes).toBeGreaterThan(0);
      expect(first.repositories[0]).toMatchObject({ repoPath: repo, automatic: false, registered: true });
      const repositoryKey = first.repositories[0].repositoryKey!;
      for (const version of ['second', 'third']) {
        fs.writeFileSync(path.join(repo, 'file.txt'), version);
        commit(version);
        await expect(service.backupNow(repo)).resolves.toBe('created');
      }
      const records = await service.bundles.versionsByKey(first.directory, repositoryKey);
      expect(records).toHaveLength(3);
      const older = await service.previewRemoval({ repositoryKey });
      const keptBytes = fs.readFileSync(records[0].file);
      fs.appendFileSync(records[0].file, 'damaged');
      await expect(service.remove(older)).rejects.toThrow('changed');
      await expect(service.remove(await service.previewRemoval({ repositoryKey }))).rejects.toThrow('integrity');
      expect((await service.overview()).versionCount).toBe(3);
      fs.writeFileSync(records[0].file, keptBytes);
      const unknownFile = path.join(records[2].directory, 'keep.txt');
      fs.writeFileSync(unknownFile, 'Unrelated file');
      await expect(service.remove(await service.previewRemoval({ repositoryKey }))).rejects.toThrow('unfamiliar');
      expect((await service.overview()).versionCount).toBe(3);
      fs.unlinkSync(unknownFile);
      registered.length = 0;
      service.repositoriesChanged();
      expect((await service.overview()).repositories).toMatchObject([{ repoPath: repo, registered: false, repositoryKey }]);
      await expect(service.remove(await service.previewRemoval({ repositoryKey, versionId: records[1].id }))).resolves.toBe(1);
      await expect(service.remove(await service.previewRemoval({ repositoryKey }))).resolves.toBe(1);
      expect((await service.overview()).repositories[0].versions.map(({ id }) => id)).toEqual([records[0].id]);
      const last = await service.previewRemoval({ repositoryKey, versionId: records[0].id });
      expect(last.lastVersion).toBe(true);
      await service.chooseDirectory(backupDir);
      await expect(service.remove(last)).rejects.toThrow();
      await service.resetDirectory();
      await expect(service.remove(last)).resolves.toBe(1);
      expect(await service.overview()).toMatchObject({ versionCount: 0, totalBytes: 0, repositories: [] });
    } finally {
      await service.dispose();
    }
  }, 55_000);

  it('migrates an enabled global configuration once and leaves newly registered repositories unselected', async () => {
    const profile = path.join(root, 'profile');
    fs.mkdirSync(profile);
    fs.writeFileSync(path.join(profile, 'branch-backups.json'), JSON.stringify({ enabled: true, directory: backupDir }));
    const registered = [repo];
    const service = new BranchBackupService(profile, runner, heads, tips, () => registered);
    try {
      expect((await service.overview()).repositories[0].automatic).toBe(true);
      await service.enable(false);
      registered.push(path.join(root, 'another-repository'));
      expect((await service.overview()).repositories.map(({ automatic }) => automatic)).toEqual([true, false]);
      expect(JSON.parse(fs.readFileSync(path.join(profile, 'branch-backups.json'), 'utf8'))).toMatchObject({ directory: backupDir, automatic: [repo] });
    } finally {
      await service.dispose();
    }
  }, 20_000);
});
