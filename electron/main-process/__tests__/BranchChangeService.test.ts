import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from '../../git/__tests__/gitIntegrationLifecycle';
import { fixture, git, cleanupTransferFixtures } from '../../git/__tests__/remoteTransferFixture';
import { PlannerWorkCache } from '../PlannerWorkCache';
import { BranchChangeService, type BranchChangeContext } from '../BranchChangeService';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
function setup() {
  const lifecycle = new GitIntegrationLifecycle();
  lifecycles.push(lifecycle);
  const f = fixture(lifecycle);
  const cache = new PlannerWorkCache(path.join(f.root, 'cache'));
  const service = new BranchChangeService(lifecycle.runner, cache);
  const context: BranchChangeContext = { ownerId: 1, signal: lifecycle.signal, ensureActive: () => lifecycle.signal.throwIfAborted() };
  git(f.repo, 'branch', 'target');
  const inspect = () => service.inspect({ repoPath: f.repo, target: { kind: 'existing', branch: 'target' } }, context);
  const execute = async (mode: 'carry' | 'park' = 'carry') => {
    const plan = await inspect();
    return service.execute({ repoPath: f.repo, planId: plan.planId, mode, name: 'Reviewed changes' }, context);
  };
  const dirty = () => {
    fs.writeFileSync(path.join(f.repo, 'file.txt'), 'staged\n');
    git(f.repo, 'add', 'file.txt');
    fs.appendFileSync(path.join(f.repo, 'file.txt'), 'unstaged\n');
    fs.writeFileSync(path.join(f.repo, 'new.txt'), 'new file');
  };
  return { ...f, lifecycle, cache, service, context, inspect, execute, dirty };
}
const test = (name: string, run: (f: ReturnType<typeof setup>) => Promise<void>) =>
  it(
    name,
    async () => {
      const f = setup();
      await f.lifecycle.track(run(f));
    },
    120_000,
  );
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(os.tmpdir(), `ogc-change-${randomUUID()}`));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
});
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((entry) => entry.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await cleanupTransferFixtures();
}, 60_000);

describe('guided branch changes with real Git', () => {
  test('reports actual file counts and preparation stages before returning the preview', async (f) => {
    f.dirty();
    const progress = vi.fn();
    const preview = await f.service.inspect({ repoPath: f.repo, target: { kind: 'existing', branch: 'target' } }, { ...f.context, progress });
    expect(progress.mock.calls[0][1].phase).toBe('repository');
    expect(progress.mock.calls.at(-1)![1].phase).toBe('target');
    const counts = progress.mock.calls.filter(([, detail]) => detail.phase === 'files').map(([, detail]) => detail.processedFiles);
    expect(counts[0]).toBe(0);
    expect(counts.at(-1)).toBe(preview.files.length);
    expect(progress.mock.calls.find(([, detail]) => detail.phase === 'files')![1].totalFiles).toBe(2);
  });
  test('checks active operation markers in the correct worktree Git directory', async (f) => {
    const tree = path.join(f.root, 'linked');
    git(f.repo, 'worktree', 'add', tree, 'target');
    fs.writeFileSync(path.join(f.repo, '.git', 'MERGE_HEAD'), `${f.initial}\n`);
    const request = { repoPath: tree, target: { kind: 'detached' as const, ref: 'HEAD' } };
    expect((await f.service.inspect(request, f.context)).blocks.join(' ')).not.toContain('active Git operation');
    const gitDir = git(tree, 'rev-parse', '--absolute-git-dir');
    fs.writeFileSync(path.join(gitDir, 'CHERRY_PICK_HEAD'), `${f.initial}\n`);
    expect((await f.service.inspect(request, f.context)).blocks.join(' ')).toContain('active Git operation');
  });
  test('preserves staged renames, unstaged deletions and tracked binary edits', async (f) => {
    fs.writeFileSync(path.join(f.repo, 'delete.txt'), 'remove me');
    fs.writeFileSync(path.join(f.repo, 'delete.bin'), Buffer.from([0, 12, 250]));
    fs.writeFileSync(path.join(f.repo, 'binary.bin'), Buffer.from([0, 1, 2]));
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'base files');
    git(f.repo, 'update-ref', 'refs/heads/target', git(f.repo, 'rev-parse', 'HEAD'));
    git(f.repo, 'mv', 'file.txt', 'renamed.txt');
    fs.unlinkSync(path.join(f.repo, 'delete.txt'));
    fs.unlinkSync(path.join(f.repo, 'delete.bin'));
    fs.writeFileSync(path.join(f.repo, 'binary.bin'), Buffer.from([0, 255, 240]));
    git(f.repo, 'add', 'binary.bin');
    const status = git(f.repo, 'status', '--porcelain=v1');
    expect((await f.inspect()).files.find((file) => file.path === 'delete.bin')?.binary).toBe(true);
    const result = await f.execute();
    expect(result.error).toBeUndefined();
    expect(result.restored).toBe(true);
    expect(git(f.repo, 'status', '--porcelain=v1')).toBe(status);
    expect(fs.existsSync(path.join(f.repo, 'delete.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(f.repo, 'binary.bin'))).toEqual(Buffer.from([0, 255, 240]));
  });
  test('creates a remote-tracking branch without another fetch and leaves clean checkouts stash-free', async (f) => {
    const remote = f.bare('server');
    git(f.repo, 'remote', 'add', 'origin', remote);
    git(f.repo, 'push', 'origin', 'main');
    f.dirty();
    const plan = await f.service.inspect(
      { repoPath: f.repo, target: { kind: 'create', branch: 'tracked', startPoint: 'refs/remotes/origin/main', tracking: true } },
      f.context,
    );
    expect((await f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'carry', name: 'Tracking work' }, f.context)).restored).toBe(true);
    expect(git(f.repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main');
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'finish work');
    expect((await f.execute()).session).toBeUndefined();
    expect(git(f.repo, 'stash', 'list')).toBe('');
  });
  test('blocks dirty submodule contents before creating a stash', async (f) => {
    const sub = path.join(f.root, 'submodule');
    fs.mkdirSync(sub);
    git(sub, 'init', '-b', 'main');
    git(sub, 'config', 'user.name', 'Test');
    git(sub, 'config', 'user.email', 'test@example.invalid');
    git(sub, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(sub, 'child.txt'), 'base');
    git(sub, 'add', '.');
    git(sub, 'commit', '-m', 'initial');
    git(f.repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', sub, 'module');
    git(f.repo, 'commit', '-am', 'submodule');
    fs.writeFileSync(path.join(f.repo, 'module', 'child.txt'), 'uncommitted child work');
    expect((await f.inspect()).blocks.join(' ')).toContain('modified submodules');
    expect(git(f.repo, 'stash', 'list')).toBe('');
  });
  test('carries partial staging, new text and binary files and removes only its own successful stash', async (f) => {
    f.dirty();
    const binary = Buffer.from([0, 255, 12, 0, 150]);
    fs.writeFileSync(path.join(f.repo, 'new.bin'), binary);
    const before = git(f.repo, 'status', '--porcelain=v1');
    const plan = await f.inspect();
    expect(plan.files.find((entry) => entry.path === 'file.txt')).toMatchObject({ index: 'M', worktree: 'M' });
    expect(plan.files.find((entry) => entry.path === 'new.bin')?.binary).toBe(true);
    const result = await f.execute();
    expect(result.error).toBeUndefined();
    expect(result.restored).toBe(true);
    expect(result.switched).toBe(true);
    expect(git(f.repo, 'branch', '--show-current')).toBe('target');
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8')).toBe('staged\nunstaged\n');
    expect(fs.readFileSync(path.join(f.repo, 'new.bin'))).toEqual(binary);
    expect(git(f.repo, 'status', '--porcelain=v1')).toBe(before);
    expect(git(f.repo, 'stash', 'list')).toBe('');
    expect(await f.service.list(f.repo)).toEqual([]);
  });
  test('preserves staged state and cleans its backup with Windows CRLF conversion enabled', async (f) => {
    git(f.repo, 'config', 'core.autocrlf', 'true');
    f.dirty();
    const result = await f.execute();
    expect(result.error).toBeUndefined();
    expect(result.restored).toBe(true);
    expect(git(f.repo, 'stash', 'list')).toBe('');
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('staged\nunstaged\n');
    expect(fs.readFileSync(path.join(f.repo, 'new.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('new file');
  });
  test('parks and restores after a restart with separate staged and unstaged file groups', async (f) => {
    f.dirty();
    fs.writeFileSync(path.join(f.repo, 'new.bin'), Buffer.from([0, 12, 250]));
    const parked = await f.execute('park');
    expect(parked.error).toBeUndefined();
    expect(parked.session?.stashOid).toMatch(/^[a-f0-9]{40,64}$/);
    expect(git(f.repo, 'status', '--porcelain=v1')).toBe('');
    expect(fs.existsSync(path.join(f.repo, 'new.txt'))).toBe(false);
    git(f.repo, 'switch', 'main');
    const restarted = new BranchChangeService(f.lifecycle.runner, f.cache);
    const records = await restarted.list(f.repo);
    expect(records[0].sourceBranch).toBe('main');
    const plan = await restarted.inspect({ repoPath: f.repo, sessionId: records[0].id }, f.context);
    expect(plan.files.find((entry) => entry.path === 'file.txt')).toMatchObject({ index: 'M', worktree: 'M' });
    expect(plan.files.find((entry) => entry.path === 'new.txt')?.index).toBe('?');
    expect(plan.files.find((entry) => entry.path === 'new.bin')?.binary).toBe(true);
    const restored = await restarted.restore(f.repo, plan.planId, f.context);
    expect(restored.restored).toBe(true);
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
    expect(fs.readFileSync(path.join(f.repo, 'new.txt'), 'utf8')).toBe('new file');
    expect(await restarted.list(f.repo)).toEqual([]);
  });
  test('reports the actual detached revision after an interrupted checkout and retains the restorable stash', async (f) => {
    f.dirty();
    const expectedHead = git(f.repo, 'rev-parse', 'HEAD');
    const plan = await f.service.inspect({ repoPath: f.repo, target: { kind: 'detached', ref: expectedHead } }, f.context);
    const original = f.lifecycle.runner.withExclusiveWrite.bind(f.lifecycle.runner);
    vi.spyOn(f.lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(
        repo,
        command,
        (runner) =>
          work({
            ...runner,
            run: async (cwd, args, options) => {
              const result = await runner.run(cwd, args, options);
              if (args[0] === 'switch') throw new Error('Checkout result interrupted');
              return result;
            },
          }),
        signal,
      ),
    );
    const result = await f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'carry', name: 'Detached work' }, f.context);
    expect(result.switched).toBe(true);
    expect(result.session).toMatchObject({ currentBranch: '', currentHead: expectedHead });
    expect(git(f.repo, 'branch', '--show-current')).toBe('');
    const restore = await f.service.inspect({ repoPath: f.repo, sessionId: result.session!.id }, f.context);
    expect((await f.service.restore(f.repo, restore.planId, f.context)).restored).toBe(true);
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
  });
  test('resolves a parked stash by OID after another stash has been inserted', async (f) => {
    f.dirty();
    const parked = await f.execute('park');
    fs.writeFileSync(path.join(f.repo, 'other.txt'), 'other work');
    git(f.repo, 'stash', 'push', '-u', '-m', 'Other stash');
    git(f.repo, 'switch', 'main');
    const plan = await f.service.inspect({ repoPath: f.repo, sessionId: parked.session!.id }, f.context);
    expect((await f.service.restore(f.repo, plan.planId, f.context)).restored).toBe(true);
    expect(git(f.repo, 'stash', 'list')).toContain('Other stash');
    expect(git(f.repo, 'stash', 'list')).not.toContain('[OGC:');
  });
  test('removes journal metadata for a stash explicitly deleted outside the assistant', async (f) => {
    f.dirty();
    await f.execute('park');
    git(f.repo, 'stash', 'drop', 'stash@{0}');
    expect(await f.service.list(f.repo)).toEqual([]);
    expect(await f.service.store.list(f.repo)).toEqual([]);
  });
  test('retains the stash and never retries a conflicting index restoration', async (f) => {
    git(f.repo, 'switch', 'target');
    f.commit('target code');
    git(f.repo, 'switch', 'main');
    f.dirty();
    const result = await f.execute();
    expect(result.restored).toBe(false);
    expect(result.session?.phase).toBe('conflict');
    expect(result.error).toBeTruthy();
    expect(git(f.repo, 'stash', 'list')).toContain('[OGC:');
    const restarted = new BranchChangeService(f.lifecycle.runner, f.cache);
    const plan = await restarted.inspect({ repoPath: f.repo, sessionId: result.session!.id }, f.context);
    expect(plan.blocks.join(' ')).toContain('previous restoration');
    await expect(restarted.restore(f.repo, plan.planId, f.context)).rejects.toThrow();
  });
  test('rejects same-path content changes and wrong owners before stashing anything', async (f) => {
    f.dirty();
    const plan = await f.inspect();
    await expect(f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'park', name: 'No' }, { ...f.context, ownerId: 2 })).rejects.toThrow(
      'expired',
    );
    fs.appendFileSync(path.join(f.repo, 'file.txt'), 'changed after review');
    await expect(f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'park', name: 'No' }, f.context)).rejects.toThrow('working state changed');
    expect(git(f.repo, 'stash', 'list')).toBe('');
  });
  test('rejects moved target revisions and expired previews', async (f) => {
    const latest = f.commit('new source commit');
    f.dirty();
    const plan = await f.inspect();
    git(f.repo, 'update-ref', 'refs/heads/target', latest);
    await expect(f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'carry', name: 'No' }, f.context)).rejects.toThrow('target changed');
    const again = await f.inspect();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
    await expect(f.service.execute({ repoPath: f.repo, planId: again.planId, mode: 'carry', name: 'No' }, f.context)).rejects.toThrow('expired');
    expect(git(f.repo, 'stash', 'list')).toBe('');
  });
  test('protects occupied worktrees and rejects restoring into another worktree', async (f) => {
    const tree = path.join(f.root, 'linked');
    git(f.repo, 'worktree', 'add', tree, 'target');
    f.dirty();
    const plan = await f.inspect();
    expect(plan.occupiedWorktree).toBe(tree.replace(/\\/g, '/'));
    expect(plan.blocks.join(' ')).toContain('another worktree');
    await expect(f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'park', name: 'No' }, f.context)).rejects.toThrow('another worktree');
    git(f.repo, 'worktree', 'remove', tree);
    const parked = await f.execute('park');
    git(f.repo, 'worktree', 'add', tree, 'main');
    const restore = await f.service.inspect({ repoPath: tree, sessionId: parked.session!.id }, f.context);
    expect(restore.blocks.join(' ')).toContain('original worktree');
  });
  test('blocks active Git operations without changing files', async (f) => {
    f.dirty();
    fs.writeFileSync(path.join(f.repo, '.git', 'MERGE_HEAD'), `${f.initial}\n`);
    const plan = await f.inspect();
    expect(plan.blocks.join(' ')).toContain('active Git operation');
    expect(git(f.repo, 'stash', 'list')).toBe('');
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
  });
  test('keeps ignored files when checkout collides and offers restoration on the source branch', async (f) => {
    fs.writeFileSync(path.join(f.repo, '.gitignore'), 'ignored.txt\n');
    git(f.repo, 'add', '.gitignore');
    git(f.repo, 'commit', '-m', 'ignore');
    git(f.repo, 'switch', 'target');
    fs.writeFileSync(path.join(f.repo, 'ignored.txt'), 'target');
    git(f.repo, 'add', 'ignored.txt');
    git(f.repo, 'commit', '-m', 'target file');
    git(f.repo, 'switch', 'main');
    fs.writeFileSync(path.join(f.repo, 'ignored.txt'), 'keep my ignored file');
    f.dirty();
    const result = await f.execute('park');
    expect(result.error).toBeTruthy();
    expect(result.switched).toBe(false);
    expect(fs.readFileSync(path.join(f.repo, 'ignored.txt'), 'utf8')).toBe('keep my ignored file');
    const plan = await f.service.inspect({ repoPath: f.repo, sessionId: result.session!.id }, f.context);
    expect(plan.blocks).toEqual([]);
    expect((await f.service.restore(f.repo, plan.planId, f.context)).restored).toBe(true);
  });
  test('retains an applied backup instead of deleting a changed stash stack', async (f) => {
    fs.writeFileSync(path.join(f.repo, 'file.txt'), 'previous stash');
    git(f.repo, 'stash', 'push', '-m', 'Earlier backup');
    const otherOid = git(f.repo, 'rev-parse', 'refs/stash');
    f.dirty();
    const original = f.lifecycle.runner.withExclusiveWrite.bind(f.lifecycle.runner);
    vi.spyOn(f.lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(
        repo,
        command,
        (runner) =>
          work({
            ...runner,
            run: async (cwd, args, options) => {
              const result = await runner.run(cwd, args, options);
              if (args[0] === 'stash' && args[1] === 'apply') git(f.repo, 'stash', 'store', '-m', 'External stash', otherOid);
              return result;
            },
          }),
        signal,
      ),
    );
    const result = await f.execute();
    expect(result.restored).toBe(true);
    expect(result.session?.phase).toBe('applied');
    expect(result.error).toContain('retained');
    expect(git(f.repo, 'stash', 'list')).toContain('External stash');
    const plan = await f.service.inspect({ repoPath: f.repo, sessionId: result.session!.id }, f.context);
    expect(plan.blocks.join(' ')).toContain('previous restoration');
  });
  test('retains its backup if an external reset discards the restored working state', async (f) => {
    f.dirty();
    const original = f.lifecycle.runner.withExclusiveWrite.bind(f.lifecycle.runner);
    vi.spyOn(f.lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(
        repo,
        command,
        (runner) =>
          work({
            ...runner,
            run: async (cwd, args, options) => {
              const result = await runner.run(cwd, args, options);
              if (args[0] === 'stash' && args[1] === 'apply') git(f.repo, 'reset', '--hard', 'HEAD');
              return result;
            },
          }),
        signal,
      ),
    );
    const result = await f.execute();
    expect(result.restored).toBe(true);
    expect(result.error).toContain('backup was retained');
    expect(result.session?.phase).toBe('applied');
    expect(git(f.repo, 'stash', 'list')).toContain('[OGC:');
  });
  test('requires explicit review before recovering an interrupted restoration', async (f) => {
    f.dirty();
    const parked = await f.execute('park');
    await f.service.store.save(f.repo, { ...parked.session!, phase: 'applying' });
    const blocked = await f.service.inspect({ repoPath: f.repo, sessionId: parked.session!.id }, f.context);
    expect(blocked.blocks.join(' ')).toContain('previous restoration');
    const reviewed = await f.service.inspect({ repoPath: f.repo, sessionId: parked.session!.id, reviewedRecovery: true }, f.context);
    expect(reviewed.blocks).toEqual([]);
    expect((await f.service.restore(f.repo, reviewed.planId, f.context)).restored).toBe(true);
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
  });
  test('stops after a completed stash on cancellation and recovers its OID after restart', async (f) => {
    f.dirty();
    const controller = new AbortController();
    const context = { ...f.context, signal: controller.signal, ensureActive: () => controller.signal.throwIfAborted() };
    const plan = await f.service.inspect({ repoPath: f.repo, target: { kind: 'existing', branch: 'target' } }, context);
    const original = f.lifecycle.runner.withExclusiveWrite.bind(f.lifecycle.runner);
    vi.spyOn(f.lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(
        repo,
        command,
        (runner) =>
          work({
            ...runner,
            run: async (cwd, args, options) => {
              const result = await runner.run(cwd, args, options);
              if (args[0] === 'stash' && args[1] === 'push') controller.abort();
              return result;
            },
          }),
        signal,
      ),
    );
    const result = await f.service.execute({ repoPath: f.repo, planId: plan.planId, mode: 'carry', name: 'Cancelled switch' }, context);
    expect(result.switched).toBe(false);
    expect(git(f.repo, 'branch', '--show-current')).toBe('main');
    const restarted = new BranchChangeService(f.lifecycle.runner, f.cache);
    const sessions = await restarted.list(f.repo);
    expect(sessions[0].stashOid).toBeTruthy();
    const recover = await restarted.inspect({ repoPath: f.repo, sessionId: sessions[0].id }, f.context);
    expect((await restarted.restore(f.repo, recover.planId, f.context)).restored).toBe(true);
  });
});
