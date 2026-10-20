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

describe('BranchCleanupService with real Git', () => {
  test('proposes merged local branches and deletes an independently selected local/server pair after review', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'feature/done');
    git(f.repo, 'branch', 'feature/second');
    git(f.repo, 'push', 'origin', 'feature/done');
    git(f.repo, 'branch', '--set-upstream-to=origin/feature/done', 'feature/done');
    const plan = await f.inspect();
    const local = plan.candidates.find((candidate) => candidate.kind === 'local' && candidate.name === 'feature/done')!;
    const second = plan.candidates.find((candidate) => candidate.kind === 'local' && candidate.name === 'feature/second')!;
    const remote = plan.candidates.find((candidate) => candidate.kind === 'server' && candidate.name === 'feature/done')!;
    expect(local).toMatchObject({ classification: 'merged', selectedByDefault: true, blocks: [], requiresForce: false });
    expect(remote).toMatchObject({ classification: 'merged', selectedByDefault: false, blocks: [], linkedLocalIds: [local.id] });
    expect(f.hasRef(f.repo, 'refs/heads/feature/done')).toBe(true);
    const result = await f.execute(plan, [local, second, remote]);
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(['deleted', 'deleted', 'deleted']);
    expect(f.hasRef(f.server, 'refs/heads/feature/done')).toBe(false);
    expect(f.hasRef(f.repo, 'refs/heads/feature/done')).toBe(false);
    expect(f.hasRef(f.repo, 'refs/heads/feature/second')).toBe(false);
    expect(f.hasRef(f.repo, 'refs/remotes/origin/feature/done')).toBe(false);
    expect(git(f.repo, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
    await expect(f.execute(plan, [local])).rejects.toThrow('expired');
  });

  test('does not prune missing remote refs or alter tags during inspection and requires explicit confirmation for orphaned work', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'checkout', '-b', 'orphaned');
    f.commit('unmerged work');
    git(f.repo, 'push', '-u', 'origin', 'orphaned');
    git(f.repo, 'checkout', 'main');
    git(f.server, 'update-ref', '-d', 'refs/heads/orphaned');
    git(f.repo, 'tag', 'keep-tag');
    const before = git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)');
    const plan = await f.inspect();
    expect(git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)')).toBe(before);
    const candidate = plan.candidates.find((entry) => entry.kind === 'local' && entry.name === 'orphaned')!;
    expect(candidate).toMatchObject({ classification: 'orphaned', requiresForce: true, unmergedCommitCount: 1, selectedByDefault: false, blocks: [] });
    await expect(f.execute(plan, [candidate])).rejects.toThrow('additional confirmation');
    expect((await f.execute(plan, [candidate], [candidate.id])).outcomes[0].status).toBe('deleted');
    expect(f.hasRef(f.repo, 'refs/tags/keep-tag')).toBe(true);
  });

  test('protects active, missing and locked worktrees as well as configured protection patterns', async (lifecycle) => {
    const f = cleanupFixture(lifecycle, false);
    git(f.repo, 'branch', 'feature/active');
    git(f.repo, 'branch', 'feature/missing');
    git(f.repo, 'branch', 'release/keep');
    const active = path.join(f.root, 'active-worktree'),
      missing = path.join(f.root, 'missing-worktree');
    git(f.repo, 'worktree', 'add', active, 'feature/active');
    git(f.repo, 'worktree', 'add', missing, 'feature/missing');
    git(f.repo, 'worktree', 'lock', missing);
    const resolved = path.resolve(missing);
    if (path.dirname(resolved) !== path.resolve(f.root)) throw new Error('Unsafe worktree fixture');
    fs.rmSync(resolved, { recursive: true });
    f.preferences.write(f.repo, { protectedPatterns: ['release/*'] });
    const plan = await f.inspect();
    for (const name of ['main', 'feature/active', 'feature/missing', 'release/keep']) {
      const candidate = plan.candidates.find((entry) => entry.name === name)!;
      expect(candidate.blocks.length).toBeGreaterThan(0);
      expect(candidate.selectedByDefault).toBe(false);
      await expect(f.execute(plan, [candidate])).rejects.toThrow('protected');
    }
    expect(plan.candidates.find((entry) => entry.name === 'feature/missing')?.worktrees).toEqual([missing.replace(/\\/g, '/')]);
    expect(f.preferences.read(active).protectedPatterns).toContain('release/*');
  });

  test('retains diverged branches without upstreams and identifies branches whose remote was removed', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'checkout', '-b', 'unpublished');
    f.commit('ongoing unpublished work');
    git(f.repo, 'branch', 'lost-remote');
    git(f.repo, 'config', 'branch.lost-remote.remote', 'removed');
    git(f.repo, 'config', 'branch.lost-remote.merge', 'refs/heads/lost-remote');
    git(f.repo, 'checkout', 'main');
    const plan = await f.inspect();
    expect(plan.candidates.find((entry) => entry.name === 'unpublished')).toMatchObject({ classification: 'other', selectedByDefault: false });
    expect(plan.candidates.find((entry) => entry.name === 'lost-remote')).toMatchObject({ classification: 'orphaned', requiresForce: true, blocks: [] });
  });

  test('keeps local results available offline while never inferring missing upstreams from an unreachable server', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'merged-offline');
    git(f.repo, 'remote', 'set-url', 'origin', path.join(f.root, 'unreachable.git'));
    const plan = await f.inspect();
    expect(plan.warnings.length).toBeGreaterThan(0);
    const candidate = plan.candidates.find((entry) => entry.name === 'merged-offline')!;
    expect(candidate).toMatchObject({ classification: 'merged', selectedByDefault: true, blocks: [] });
    const outcome = (await f.execute(plan, [candidate])).outcomes[0];
    expect(outcome.message).toBe('deleted');
    expect(outcome.status).toBe('deleted');
  });
});
