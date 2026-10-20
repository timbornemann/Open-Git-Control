import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { git, cleanupTransferFixtures } from './remoteTransferFixture';
import { cleanupFixture } from './branchCleanupFixture';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
const test = (name: string, work: (lifecycle: GitIntegrationLifecycle) => Promise<void>) =>
  it(
    name,
    () => {
      const lifecycle = new GitIntegrationLifecycle();
      lifecycles.push(lifecycle);
      return lifecycle.track(Promise.resolve().then(() => work(lifecycle)));
    },
    60_000,
  );
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(os.tmpdir(), `ogc-cleanup-no-global-${randomUUID()}`));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
});
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await cleanupTransferFixtures();
}, 60_000);

describe('branch cleanup snapshot and deletion safeguards', () => {
  test('binds plans to their window, generation and lifetime and rejects protected selections', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'done');
    const plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.name === 'done')!;
    await expect(f.execute(plan, [candidate], [], { ...f.context, ownerId: 2 })).rejects.toThrow('expired');
    await expect(f.execute(plan, [candidate], [], { ...f.context, generation: 1 })).rejects.toThrow('expired');
    await expect(f.execute(plan, [plan.candidates.find((entry) => entry.name === 'main')!])).rejects.toThrow('protected');
    f.state.now += 15 * 60_000;
    await expect(f.execute(plan, [candidate])).rejects.toThrow('expired');
    expect(f.hasRef(f.repo, 'refs/heads/done')).toBe(true);
  });

  test('skips a branch advanced after the preview', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'done');
    const plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.name === 'done')!;
    const next = git(f.repo, 'commit-tree', git(f.repo, 'write-tree'), '-p', f.initial, '-m', 'new work');
    git(f.repo, 'update-ref', candidate.ref, next);
    expect((await f.execute(plan, [candidate])).outcomes[0]).toMatchObject({ status: 'skipped', message: 'changed' });
    expect(git(f.repo, 'rev-parse', candidate.ref)).toBe(next);
  });

  test('uses an expected old SHA even if a branch changes immediately before the ref transaction', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'done');
    const plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.name === 'done')!;
    const next = git(f.repo, 'commit-tree', git(f.repo, 'write-tree'), '-p', f.initial, '-m', 'concurrent work');
    const original = lifecycle.runner.withExclusiveWrite.bind(lifecycle.runner);
    let raced = false;
    vi.spyOn(lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(
        repo,
        command,
        async (scoped) =>
          work({
            ...scoped,
            input: async (cwd, args, input, ignoreAbort, environment) => {
              if (!raced && command === 'branch-cleanup' && args.includes('update-ref')) {
                raced = true;
                git(f.repo, 'update-ref', candidate.ref, next);
              }
              return scoped.input(cwd, args, input, ignoreAbort, environment);
            },
          }),
        signal,
      ),
    );
    expect((await f.execute(plan, [candidate])).outcomes[0].status).toBe('failed');
    expect(raced).toBe(true);
    expect(git(f.repo, 'rev-parse', candidate.ref)).toBe(next);
    expect(fs.existsSync(path.join(f.repo, '.git', 'HEAD.lock'))).toBe(false);
  });

  test('keeps newly assigned worktrees and refuses cleanup while a sequencer operation is active', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'done');
    let plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.name === 'done')!;
    git(f.repo, 'worktree', 'add', path.join(f.root, 'new-worktree'), 'done');
    expect((await f.execute(plan, [candidate])).outcomes[0].status).toBe('skipped');
    fs.writeFileSync(path.join(f.repo, '.git', 'MERGE_HEAD'), `${f.initial}\n`);
    plan = await f.inspect();
    expect(plan.candidates.every((entry) => entry.blocks.some((block) => block.code === 'operation'))).toBe(true);
  });

  test('revalidates protection, open requests, accounts and persisted protection patterns', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'done');
    git(f.repo, 'push', 'origin', 'done');
    let plan = await f.inspect();
    let server = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')!;
    f.state.openRequests = [{ number: '12', sourceRepository: 'team/repo', sourceBranch: 'done', targetRepository: 'team/repo', targetBranch: 'main' }];
    expect((await f.execute(plan, [server])).outcomes[0]).toMatchObject({ status: 'skipped', message: 'changed' });
    f.state.openRequests = [];
    plan = await f.inspect();
    server = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')!;
    f.state.protected.add('done');
    expect((await f.execute(plan, [server])).outcomes[0].status).toBe('skipped');
    f.state.protected.delete('done');
    plan = await f.inspect();
    server = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')!;
    f.state.account = 'another-account';
    expect((await f.execute(plan, [server])).outcomes[0].status).toBe('skipped');
    plan = await f.inspect();
    const local = plan.candidates.find((entry) => entry.kind === 'local' && entry.name === 'done')!;
    f.preferences.write(f.repo, { protectedPatterns: ['done'] });
    expect((await f.execute(plan, [local])).outcomes[0].status).toBe('skipped');
    expect(f.hasRef(f.server, 'refs/heads/done')).toBe(true);
  });

  test('blocks server deletion on incomplete metadata but continues to propose merged local branches', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'done');
    git(f.repo, 'push', 'origin', 'done');
    f.state.complete = false;
    const plan = await f.inspect();
    expect(plan.candidates.find((entry) => entry.kind === 'local' && entry.name === 'done')).toMatchObject({ blocks: [], selectedByDefault: true });
    expect(plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')?.blocks.map((block) => block.code)).toContain(
      'unknown-protection',
    );
  });

  test('stops remaining deletions after cancellation while reporting the completed commit point', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'one');
    git(f.repo, 'branch', 'two');
    const controller = new AbortController();
    const context = { ...f.context, signal: AbortSignal.any([lifecycle.signal, controller.signal]), ensureActive: () => controller.signal.throwIfAborted() };
    const plan = await f.inspect();
    const selected = plan.candidates.filter((entry) => ['one', 'two'].includes(entry.name));
    const original = lifecycle.runner.withExclusiveWrite.bind(lifecycle.runner);
    vi.spyOn(lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      original(
        repo,
        command,
        async (scoped) =>
          work({
            ...scoped,
            input: async (...args) => {
              const value = await scoped.input(...args);
              if (command === 'branch-cleanup') controller.abort();
              return value;
            },
          }),
        signal,
      ),
    );
    const result = await f.execute(plan, selected, [], context);
    expect(result.cancelled).toBe(true);
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(['deleted', 'skipped']);
    expect(f.hasRef(f.repo, selected[1].ref)).toBe(true);
  });

  test('requires an explicit comparison for ambiguous defaults and refuses incomplete histories', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'master');
    git(f.repo, 'branch', 'done');
    let plan = await f.inspect();
    expect(plan.comparisons[0].targetId).toBeNull();
    expect(plan.candidates.find((entry) => entry.name === 'done')?.blocks.map((entry) => entry.code)).toContain('missing-target');
    const target = plan.targets.find((entry) => entry.name === 'main')!;
    plan = await f.inspect({ local: target.id });
    expect(plan.candidates.find((entry) => entry.name === 'done')).toMatchObject({ blocks: [], selectedByDefault: true });
    fs.writeFileSync(path.join(f.repo, '.git', 'shallow'), `${f.initial}\n`);
    plan = await f.inspect({ local: target.id });
    expect(plan.candidates.every((candidate) => candidate.blocks.some((block) => block.code === 'incomplete-history'))).toBe(true);
  });
});
