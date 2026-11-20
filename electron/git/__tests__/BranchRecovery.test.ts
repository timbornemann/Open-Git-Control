import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { BranchBackupService } from '../BranchBackupService';
import { BranchBundleStore, readBranchTips } from '../branchBundles';
import { describeBranchRepository } from '../branchRecoveryRepository';
import { BranchRecoveryService } from '../BranchRecoveryService';
import { BranchRepairSnapshots } from '../BranchRepairSnapshots';
import { BranchTipJournal } from '../BranchTipJournal';
import { RepositoryHeadService } from '../RepositoryHeadService';
import { configureFixtureRepository } from './gitFixtureHistory';

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-branch-repair-test-'));
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
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-branch-repair-test-'))
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

  it('starts for all open repositories after opt-in and reports an unavailable destination', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'first');
    commit('Initial');
    const second = path.join(root, 'second');
    git(root, 'clone', '--quiet', repo, second);
    const start = () => new BranchBackupService(path.join(root, 'profile'), runner, heads, tips, () => [repo, second]);
    let service = start();
    try {
      expect(await service.overview()).toMatchObject({ enabled: false, directory: null });
      await expect(service.chooseDirectory(repo)).rejects.toThrow('outside');
      await service.chooseDirectory(backupDir);
      await service.enable(true);
      await vi.waitFor(async () => expect((await service.overview()).repositories.every((record) => record.verifiedAt)).toBe(true), { timeout: 20_000 });
      await service.enable(false);
      await service.dispose();
      const disconnected = path.join(root, 'removed destination');
      fs.renameSync(backupDir, disconnected);
      service = start();
      await service.enable(true);
      await vi.waitFor(async () => expect((await service.overview()).repositories.every((record) => record.verifiedAt && record.lastError)).toBe(true), {
        timeout: 20_000,
      });
    } finally {
      await service.dispose();
    }
  }, 50_000);
});
