import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { UntrackFilesService } from '../UntrackFilesService';
import type { CommitEditGit } from '../CommitEditGit';
import type { UntrackContext } from '../untrackFilesSnapshot';
import type { UntrackFilesInspection, UntrackScope } from '../../../src/shared/ipc/untrackFiles';

const repos: string[] = [];
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
const context = (controller = new AbortController()): UntrackContext => ({
  ownerId: 7,
  generation: 1,
  signal: controller.signal,
  ensureActive: () => controller.signal.throwIfAborted(),
  progress: vi.fn(),
});
function fixture(files: Record<string, string> = { 'files/a.log': 'original\n', 'files/b.log': 'other\n', 'keep.txt': 'keep\n' }, commit = true) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-untrack-'));
  repos.push(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'core.autocrlf', 'false');
  const write = (file: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  };
  for (const [file, content] of Object.entries(files)) write(file, content);
  git(repo, 'add', '.');
  if (commit) git(repo, 'commit', '--allow-empty', '-m', 'base');
  const runner = new GitRunner();
  const service = new UntrackFilesService(runner);
  const ctx = context();
  const inspect = (file = 'files/a.log', scope: UntrackScope = 'file') =>
    service.inspect({ repoPath: repo, operationId: randomUUID(), path: file, scope }, ctx);
  const execute = (
    plan: UntrackFilesInspection,
    paths = plan.candidates.filter((candidate) => !candidate.blocked).map((candidate) => candidate.path),
    executionContext = ctx,
  ) =>
    service.execute(
      {
        repoPath: repo,
        operationId: randomUUID(),
        planId: plan.planId,
        selectedIds: paths.map((file) => plan.candidates.find((candidate) => candidate.path === file)!.id),
      },
      executionContext,
    );
  const index = () => fs.readFileSync(path.resolve(repo, git(repo, 'rev-parse', '--git-path', 'index').trim()));
  const tracked = () => git(repo, 'ls-files', '-z').split('\0').filter(Boolean);
  const wrap = (decorate: (scoped: CommitEditGit) => CommitEditGit) => {
    const original = runner.withExclusiveWrite.bind(runner);
    vi.spyOn(runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(repo, command, (scoped) => work(decorate(scoped)), signal),
    );
  };
  return { repo, write, runner, service, ctx, inspect, execute, tracked, index, wrap };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const repo of repos.splice(0)) {
    if (path.dirname(path.resolve(repo)) !== path.resolve(os.tmpdir()) || !path.basename(repo).startsWith('ogc-untrack-'))
      throw new Error('Unsafe test cleanup');
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('UntrackFilesService with real Git indexes', { timeout: 45_000 }, () => {
  it('removes a committed ignored file only from the index and preserves unrelated staged work', async () => {
    const f = fixture();
    f.write('.gitignore', '*.log\n');
    f.write('keep.txt', 'staged unrelated\n');
    git(f.repo, 'add', 'keep.txt');
    const preview = await f.inspect();
    expect(preview.candidates).toEqual([expect.objectContaining({ path: 'files/a.log', ignored: true, added: false, blocked: undefined })]);
    expect(await f.execute(preview)).toEqual({ status: 'applied', paths: ['files/a.log'] });
    expect(f.tracked()).toEqual(['files/b.log', 'keep.txt']);
    expect(fs.readFileSync(path.join(f.repo, 'files/a.log'), 'utf8')).toBe('original\n');
    expect(git(f.repo, 'show', ':keep.txt')).toBe('staged unrelated\n');
    expect(git(f.repo, 'diff', '--cached', '--name-status')).toContain('D\tfiles/a.log');
    expect(fs.readFileSync(path.join(f.repo, '.gitignore'), 'utf8')).toBe('*.log\n');
  });
  it('keeps unstaged changes when the index still equals HEAD, even for a nonignored file', async () => {
    const f = fixture();
    f.write('files/a.log', 'local edits\n');
    const preview = await f.inspect();
    expect(preview.candidates[0].ignored).toBe(false);
    expect(preview.candidates[0].blocked).toBeUndefined();
    expect((await f.execute(preview)).status).toBe('applied');
    expect(fs.readFileSync(path.join(f.repo, 'files/a.log'), 'utf8')).toBe('local edits\n');
  });
  it.each([true, false])('removes a newly staged file with unborn=%s without deleting it', async (unborn) => {
    const f = fixture({}, !unborn);
    f.write('new.txt', 'new content\n');
    git(f.repo, 'add', 'new.txt');
    const preview = await f.inspect('new.txt');
    expect(preview.candidates[0]).toMatchObject({ added: true, blocked: undefined });
    expect((await f.execute(preview)).status).toBe('applied');
    expect(f.tracked()).toEqual([]);
    expect(fs.readFileSync(path.join(f.repo, 'new.txt'), 'utf8')).toBe('new content\n');
  });
  it('blocks unique staged content and refuses a tampered selection without changing the index', async () => {
    const f = fixture();
    f.write('files/a.log', 'staged only\n');
    git(f.repo, 'add', 'files/a.log');
    f.write('files/a.log', 'newer working\n');
    const preview = await f.inspect('files/a.log', 'directory');
    expect(preview.candidates.find((candidate) => candidate.path === 'files/a.log')?.blocked).toBe('indexOnly');
    const before = f.index();
    await expect(f.execute(preview, ['files/a.log', 'files/b.log'])).rejects.toThrow('unavailable');
    expect(f.index()).toEqual(before);
    expect(git(f.repo, 'show', ':files/a.log')).toBe('staged only\n');
  });
  it('supports missing worktree files and staged renames without touching worktree contents', async () => {
    const f = fixture();
    fs.unlinkSync(path.join(f.repo, 'files/a.log'));
    let preview = await f.inspect();
    expect((await f.execute(preview)).status).toBe('applied');
    git(f.repo, 'mv', 'files/b.log', 'files/renamed.log');
    preview = await f.inspect('files/renamed.log');
    expect((await f.execute(preview)).status).toBe('applied');
    expect(fs.readFileSync(path.join(f.repo, 'files/renamed.log'), 'utf8')).toBe('other\n');
    expect(f.tracked()).toEqual(['keep.txt']);
  });
  it('derives literal folder and extension scopes with nested, exclude and global ignore rules', async () => {
    const f = fixture({
      'root/nested/a.log': 'a',
      'root/nested/b.log': 'b',
      'root/other.log': 'o',
      'outside/c.log': 'c',
      'outside/d.txt': 'd',
      'root/x[1].log': 'x',
      'root/x1.log': 'y',
    });
    f.write('.gitignore', '*.log\n!root/nested/b.log\n!outside/c.log\n!root/other.log\n');
    f.write('root/nested/.gitignore', '!a.log\n');
    f.write('.git/info/exclude', 'root/other.log\n');
    f.write('global-ignore', 'outside/c.log\n');
    git(f.repo, 'config', 'core.excludesFile', path.join(f.repo, 'global-ignore'));
    const preview = await f.inspect('root/nested/a.log', 'extension');
    expect(preview.scopes).toEqual([
      { kind: 'file', value: 'root/nested/a.log' },
      { kind: 'directory', value: 'root/nested' },
      { kind: 'topDirectory', value: 'root' },
      { kind: 'extension', value: '.log' },
    ]);
    const ignored = Object.fromEntries(preview.candidates.map((candidate) => [candidate.path, candidate.ignored]));
    // Higher-precedence negations still win over info/exclude and global rules.
    expect(ignored).toMatchObject({
      'root/nested/a.log': false,
      'root/nested/b.log': false,
      'outside/c.log': false,
      'root/other.log': false,
      'root/x[1].log': true,
    });
    const folder = await f.inspect('root/nested/a.log', 'topDirectory');
    expect(folder.candidates.every((candidate) => candidate.path.startsWith('root/'))).toBe(true);
    const literal = await f.inspect('root/x[1].log');
    expect((await f.execute(literal)).status).toBe('applied');
    expect(f.tracked()).toContain('root/x1.log');
  });
  it('honors global and repository exclude rules when no higher-precedence rule overrides them', async () => {
    const f = fixture();
    f.write('.git/info/exclude', 'files/a.log\n');
    f.write('global-ignore', 'files/b.log\n');
    git(f.repo, 'config', 'core.excludesFile', path.join(f.repo, 'global-ignore'));
    const preview = await f.inspect('files/a.log', 'directory');
    expect(preview.candidates.map((candidate) => candidate.ignored)).toEqual([true, true]);
  });
  it.each(['working', 'index', 'ignore', 'branch', 'head'])('requires a fresh preview after a concurrent %s change', async (change) => {
    const f = fixture();
    const preview = await f.inspect();
    if (change === 'working') f.write('files/a.log', 'changed later\n');
    if (change === 'index') {
      f.write('files/a.log', 'staged later\n');
      git(f.repo, 'add', 'files/a.log');
    }
    if (change === 'ignore') f.write('.gitignore', '*.log\n');
    if (change === 'branch') git(f.repo, 'checkout', '-b', 'other');
    if (change === 'head') git(f.repo, 'commit', '--allow-empty', '-m', 'new HEAD');
    const before = f.index();
    expect((await f.execute(preview)).status).toBe('stale');
    expect(f.index()).toEqual(before);
    expect(f.tracked()).toContain('files/a.log');
  });
  it('never silently adds new matches to an existing bulk selection', async () => {
    const f = fixture();
    const preview = await f.inspect('files/a.log', 'directory');
    f.write('files/later.log', 'later');
    git(f.repo, 'add', 'files/later.log');
    expect((await f.execute(preview)).status).toBe('applied');
    expect(f.tracked()).toContain('files/later.log');
  });
  it('fails atomically if rm in the private index fails partway through', async () => {
    const f = fixture();
    const preview = await f.inspect('files/a.log', 'directory');
    const before = f.index();
    f.wrap((scoped) => ({
      ...scoped,
      input: async (repo, args, input, ignored, env) => {
        if (args[0] !== 'rm') return scoped.input(repo, args, input, ignored, env);
        expect(args).not.toContain('-f');
        expect(env?.GIT_INDEX_FILE).toBeTruthy();
        await scoped.input(repo, args, ':(literal)files/a.log\0', ignored, env);
        throw new Error('simulated failure');
      },
    }));
    await expect(f.execute(preview)).rejects.toThrow('simulated failure');
    expect(f.index()).toEqual(before);
    expect(f.tracked()).toContain('files/a.log');
    expect(fs.existsSync(path.join(f.repo, '.git/index.lock'))).toBe(false);
  });
  it('checks selected contents again after private preparation and refuses a changed working file', async () => {
    const f = fixture();
    const preview = await f.inspect();
    const before = f.index();
    f.wrap((scoped) => ({
      ...scoped,
      input: async (...args) => {
        const output = await scoped.input(...args);
        if (args[1][0] === 'rm') f.write('files/a.log', 'edited during preparation');
        return output;
      },
    }));
    expect((await f.execute(preview)).status).toBe('stale');
    expect(f.index()).toEqual(before);
    expect(fs.readFileSync(path.join(f.repo, 'files/a.log'), 'utf8')).toBe('edited during preparation');
  });
  it('cancels before publication and keeps the real index intact', async () => {
    const f = fixture();
    const preview = await f.inspect();
    const before = f.index();
    const controller = new AbortController();
    const ctx = context(controller);
    ctx.progress = (phase) => {
      if (phase === 'publish') controller.abort();
    };
    await expect(f.execute(preview, undefined, ctx)).rejects.toThrow();
    expect(f.index()).toEqual(before);
    expect(f.tracked()).toContain('files/a.log');
  });
  it('binds plans to the window, repository generation, expiry and explicit candidate IDs', async () => {
    const f = fixture();
    const preview = await f.inspect();
    await expect(f.execute(preview, undefined, { ...f.ctx, ownerId: 8 })).rejects.toThrow('another window');
    expect(await f.execute(preview, undefined, { ...f.ctx, generation: 2 })).toEqual({ status: 'stale', reason: 'repository' });
    await expect(f.service.execute({ repoPath: f.repo, operationId: randomUUID(), planId: preview.planId, selectedIds: ['made-up'] }, f.ctx)).rejects.toThrow(
      'unavailable',
    );
    vi.spyOn(Date, 'now').mockReturnValue(preview.expiresAt + 1);
    expect(await f.execute(preview)).toEqual({ status: 'stale', reason: 'expired' });
  });
  it('isolates a linked worktree index from the main worktree index', async () => {
    const f = fixture();
    const second = fixture();
    const worktree = path.join(second.repo, 'linked');
    git(f.repo, 'worktree', 'add', '-b', 'linked', worktree);
    const before = f.index();
    const ctx = context();
    const preview = await f.service.inspect({ repoPath: worktree, operationId: randomUUID(), path: 'files/a.log', scope: 'file' }, ctx);
    expect(
      (
        await f.service.execute(
          { repoPath: worktree, operationId: randomUUID(), planId: preview.planId, selectedIds: preview.candidates.map((candidate) => candidate.id) },
          ctx,
        )
      ).status,
    ).toBe('applied');
    expect(f.index()).toEqual(before);
    expect(git(worktree, 'ls-files')).not.toContain('files/a.log');
    expect(fs.existsSync(path.join(worktree, 'files/a.log'))).toBe(true);
  });
  it('blocks unmerged entries and submodules, including a forged attempt to select them', async () => {
    const f = fixture();
    const blob = git(f.repo, 'rev-parse', 'HEAD:files/a.log').trim();
    const commit = git(f.repo, 'rev-parse', 'HEAD').trim();
    execFileSync('git', ['update-index', '-z', '--index-info'], {
      cwd: f.repo,
      windowsHide: true,
      input:
        `0 ${'0'.repeat(40)}\tfiles/a.log\0` +
        [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\tfiles/a.log\0`).join('') +
        `160000 ${commit}\tfiles/submodule\0`,
    });
    const plan = await f.inspect('files/a.log', 'directory');
    expect(plan.candidates.find((candidate) => candidate.path === 'files/a.log')?.blocked).toBe('conflict');
    expect(plan.candidates.find((candidate) => candidate.path === 'files/submodule')?.blocked).toBe('submodule');
    const before = f.index();
    await expect(f.execute(plan, ['files/submodule'])).rejects.toThrow('unavailable');
    expect(f.index()).toEqual(before);
  });
  it('blocks unique staged contents in an unborn repository', async () => {
    const f = fixture({ 'new.txt': 'unique index contents' }, false);
    f.write('new.txt', 'different worktree contents');
    const plan = await f.inspect('new.txt');
    expect(plan.candidates[0]).toMatchObject({ added: true, blocked: 'indexOnly' });
    const before = f.index();
    await expect(f.execute(plan, ['new.txt'])).rejects.toThrow('unavailable');
    expect(f.index()).toEqual(before);
  });
  it('handles CRLF, Unicode, whitespace and pathspec-looking characters literally', async () => {
    const name = 'files/ ä [1] $`文字.log';
    const f = fixture({ [name]: 'old\n', 'files/a1.log': 'other' });
    git(f.repo, 'config', 'core.autocrlf', 'true');
    f.write(name, Buffer.from('new\r\ncontents\r\n'));
    git(f.repo, 'add', '--', name);
    const working = fs.readFileSync(path.join(f.repo, name));
    const plan = await f.inspect(name);
    expect(plan.candidates[0].blocked).toBeUndefined();
    expect((await f.execute(plan)).status).toBe('applied');
    expect(fs.readFileSync(path.join(f.repo, name))).toEqual(working);
    expect(f.tracked()).toEqual(['files/a1.log']);
  });
  it.skipIf(process.platform === 'win32')('removes a tracked symlink itself without reading or changing its target', async () => {
    const f = fixture();
    const target = path.join(f.repo, 'keep.txt');
    fs.symlinkSync(target, path.join(f.repo, 'link'));
    git(f.repo, 'add', 'link');
    const plan = await f.inspect('link');
    expect(plan.candidates[0].blocked).toBeUndefined();
    expect((await f.execute(plan)).status).toBe('applied');
    expect(fs.readlinkSync(path.join(f.repo, 'link'))).toBe(target);
    expect(fs.readFileSync(target, 'utf8')).toBe('keep\n');
  });
  it('retains a foreign index rewrite that bypassed index.lock instead of overwriting it', async () => {
    const f = fixture();
    const plan = await f.inspect();
    let foreign!: Buffer;
    f.wrap((scoped) => ({
      ...scoped,
      input: async (...args) => {
        const result = await scoped.input(...args);
        if (args[1][0] === 'rm') {
          const actual = path.join(f.repo, '.git', 'index');
          const temporary = path.join(f.repo, '.git', 'foreign-index');
          fs.copyFileSync(actual, temporary);
          f.write('keep.txt', 'other process staged this');
          execFileSync('git', ['add', 'keep.txt'], { cwd: f.repo, env: { ...process.env, GIT_INDEX_FILE: temporary }, windowsHide: true });
          foreign = fs.readFileSync(temporary);
          fs.renameSync(temporary, actual);
        }
        return result;
      },
    }));
    await expect(f.execute(plan)).rejects.toThrow('outside the lock');
    expect(f.index()).toEqual(foreign);
    expect(git(f.repo, 'show', ':keep.txt')).toBe('other process staged this');
    expect(f.tracked()).toContain('files/a.log');
  });
  it('reports publication as completed when cancellation arrives just after the atomic rename', async () => {
    const f = fixture();
    const plan = await f.inspect();
    const controller = new AbortController();
    const rename = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(from).endsWith('index.lock')) controller.abort();
    });
    expect(await f.execute(plan, undefined, context(controller))).toEqual({ status: 'applied', paths: ['files/a.log'] });
    expect(f.tracked()).not.toContain('files/a.log');
    expect(fs.existsSync(path.join(f.repo, 'files/a.log'))).toBe(true);
  });
  it('rechecks the plan lifetime after preparation before publishing', async () => {
    const f = fixture();
    const plan = await f.inspect();
    const before = f.index();
    const ctx = context();
    ctx.progress = (phase) => {
      if (phase === 'prepare') vi.spyOn(Date, 'now').mockReturnValue(plan.expiresAt + 1);
    };
    expect(await f.execute(plan, undefined, ctx)).toEqual({ status: 'stale', reason: 'expired' });
    expect(f.index()).toEqual(before);
    expect(f.tracked()).toContain('files/a.log');
  });
});
