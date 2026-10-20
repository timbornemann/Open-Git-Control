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

describe('branch cleanup comparison targets', () => {
  test('recognizes a linear local main containing branch tips ahead of the server without authorizing server deletion', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'checkout', '-b', 'feature/first');
    f.commit('first feature');
    git(f.repo, 'push', 'origin', 'feature/first');
    git(f.repo, 'checkout', '-b', 'feature/second');
    const integrated = f.commit('second feature');
    git(f.repo, 'checkout', 'main');
    git(f.repo, 'merge', '--ff-only', 'feature/second');
    const plan = await f.inspect();
    const comparison = plan.comparisons.find((entry) => entry.id === 'local')!;
    expect(plan.targets.find((entry) => entry.id === comparison.targetId)).toMatchObject({ name: 'main', oid: integrated });
    const locals = plan.candidates.filter((entry) => entry.kind === 'local' && entry.name.startsWith('feature/'));
    expect(locals).toHaveLength(2);
    for (const candidate of locals)
      expect(candidate).toMatchObject({ classification: 'merged', unmergedCommitCount: 0, blocks: [], selectedByDefault: true, requiresForce: false });
    const server = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'feature/first')!;
    expect(server).toMatchObject({ classification: 'other', unmergedCommitCount: 1, selectedByDefault: false });
    expect(server.blocks.map((entry) => entry.code)).toContain('not-candidate');
    await expect(f.execute(plan, [server], [server.id])).rejects.toThrow('protected');
    expect((await f.execute(plan, locals)).outcomes.map((entry) => entry.status)).toEqual(['deleted', 'deleted']);
    expect(git(f.repo, 'rev-parse', 'main')).toBe(integrated);
    expect(git(f.server, 'rev-parse', 'main')).toBe(f.initial);
    expect(f.hasRef(f.server, 'refs/heads/feature/first')).toBe(true);
  });

  test('uses the local counterpart of a custom server default instead of falling back to main', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', '--move', 'main', 'trunk');
    git(f.repo, 'branch', 'main');
    git(f.repo, 'push', 'origin', 'trunk');
    git(f.server, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
    f.state.defaultBranch = 'trunk';
    git(f.repo, 'checkout', '-b', 'feature');
    const integrated = f.commit('integrated into trunk');
    git(f.repo, 'checkout', 'trunk');
    git(f.repo, 'merge', '--ff-only', 'feature');
    const plan = await f.inspect();
    expect(plan.targets.find((entry) => entry.id === plan.comparisons[0].targetId)).toMatchObject({ name: 'trunk', oid: integrated });
    expect(plan.candidates.find((entry) => entry.kind === 'local' && entry.name === 'feature')).toMatchObject({
      classification: 'merged',
      selectedByDefault: true,
      blocks: [],
    });
  });

  test('uses the server default when its local counterpart is absent', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', '--move', 'main', 'work');
    git(f.repo, 'branch', 'done');
    const plan = await f.inspect();
    expect(plan.targets.find((entry) => entry.id === plan.comparisons[0].targetId)).toMatchObject({
      name: expect.stringContaining('origin/main'),
      oid: f.initial,
    });
    expect(plan.candidates.find((entry) => entry.name === 'done')).toMatchObject({ classification: 'merged', selectedByDefault: true, blocks: [] });
  });

  test('retains detection of server integrations when local main is behind the server default', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    const integrated = f.commit('integrated on the server');
    git(f.repo, 'branch', 'done');
    git(f.repo, 'push', 'origin', 'main');
    git(f.repo, 'reset', '--hard', f.initial);
    const plan = await f.inspect();
    expect(plan.targets.find((entry) => entry.id === plan.comparisons[0].targetId)).toMatchObject({
      name: expect.stringContaining('origin/main'),
      oid: integrated,
    });
    const candidate = plan.candidates.find((entry) => entry.name === 'done')!;
    expect(candidate).toMatchObject({ classification: 'merged', unmergedCommitCount: 0, selectedByDefault: true, blocks: [] });
    expect((await f.execute(plan, [candidate])).outcomes[0].status).toBe('deleted');
    expect(git(f.repo, 'rev-parse', 'main')).toBe(f.initial);
    expect(git(f.server, 'rev-parse', 'main')).toBe(integrated);
  });

  test('honors an explicitly selected server target even when local main is ahead', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    f.commit('local integration');
    git(f.repo, 'branch', 'done');
    let plan = await f.inspect();
    expect(plan.candidates.find((entry) => entry.name === 'done')?.classification).toBe('merged');
    const target = plan.targets.find((entry) => entry.comparisonId === 'local' && entry.name.startsWith('origin/main'))!;
    plan = await f.inspect({ local: target.id });
    expect(plan.comparisons[0].targetId).toBe(target.id);
    expect(plan.candidates.find((entry) => entry.name === 'done')).toMatchObject({
      classification: 'other',
      unmergedCommitCount: 1,
      requiresForce: true,
      selectedByDefault: false,
      blocks: [],
    });
  });

  test('preserves a candidate when its local default comparison target changes after preview', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    f.commit('local integration');
    git(f.repo, 'branch', 'done');
    const plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.name === 'done')!;
    f.commit('changed comparison target');
    expect((await f.execute(plan, [candidate])).outcomes[0]).toMatchObject({ status: 'skipped', message: 'changed' });
    expect(f.hasRef(f.repo, candidate.ref)).toBe(true);
  });
});
