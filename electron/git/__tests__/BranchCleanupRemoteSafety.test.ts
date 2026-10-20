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

describe('branch cleanup remote verification', () => {
  test('retains the local counterpart when the server rejects deletion and continues independent local deletions', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'paired');
    git(f.repo, 'branch', 'independent');
    git(f.repo, 'push', 'origin', 'paired');
    git(f.server, 'config', 'receive.denyDeletes', 'true');
    const plan = await f.inspect();
    const selected = plan.candidates.filter((entry) => ['paired', 'independent'].includes(entry.name) && !entry.blocks.length);
    const result = await f.execute(plan, selected);
    expect(result.outcomes.find((outcome) => outcome.kind === 'server')?.status).toBe('failed');
    expect(result.outcomes.find((outcome) => outcome.kind === 'local' && outcome.name === 'paired')).toMatchObject({
      status: 'skipped',
      message: 'server-not-deleted',
    });
    expect(result.outcomes.find((outcome) => outcome.name === 'independent')?.status).toBe('deleted');
    expect(f.hasRef(f.repo, 'refs/heads/paired')).toBe(true);
  });

  test('uses an explicit SHA lease when the server advances after final inspection', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'done');
    git(f.repo, 'push', 'origin', 'done');
    const next = git(f.repo, 'commit-tree', git(f.repo, 'write-tree'), '-p', f.initial, '-m', 'another users work');
    git(f.repo, 'push', 'origin', `${next}:refs/heads/object-source`);
    const plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')!;
    const original = f.remotes.delete.bind(f.remotes);
    vi.spyOn(f.remotes, 'delete').mockImplementation(async (...args) => {
      git(f.server, 'update-ref', 'refs/heads/done', next);
      return original(...args);
    });
    const result = await f.execute(plan, [candidate]);
    expect(result.outcomes[0]).toMatchObject({ status: 'failed', message: 'changed' });
    expect(git(f.server, 'rev-parse', 'refs/heads/done')).toBe(next);
  });

  test('analyzes and deletes only a distinct reviewed push endpoint, fetching missing objects without changing refs or tags', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    const pushServer = f.bare('separate-push');
    git(pushServer, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(f.repo, 'push', pushServer, 'main');
    const remoteOnly = git(
      pushServer,
      '-c',
      'user.name=Remote',
      '-c',
      'user.email=remote@example.invalid',
      'commit-tree',
      git(f.repo, 'write-tree'),
      '-p',
      f.initial,
      '-m',
      'remote only commit',
    );
    git(pushServer, 'update-ref', 'refs/heads/main', remoteOnly);
    git(pushServer, 'update-ref', 'refs/heads/done', remoteOnly);
    git(f.server, 'update-ref', 'refs/heads/done', f.initial);
    git(f.repo, 'fetch', 'origin');
    git(f.repo, 'remote', 'set-url', '--push', 'origin', pushServer);
    git(f.repo, 'tag', 'unchanged-tag');
    const refs = git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)');
    const plan = await f.inspect();
    expect(git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)')).toBe(refs);
    const candidate = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')!;
    expect(candidate).toMatchObject({ oid: remoteOnly, endpoint: pushServer, classification: 'merged', blocks: [] });
    expect((await f.execute(plan, [candidate])).outcomes[0].status).toBe('deleted');
    expect(f.hasRef(pushServer, 'refs/heads/done')).toBe(false);
    expect(f.hasRef(f.server, 'refs/heads/done')).toBe(true);
    expect(f.hasRef(f.repo, 'refs/remotes/origin/done')).toBe(true);
  });

  test('recognizes squash merges only for the exact reviewed source SHA', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'checkout', '-b', 'squashed');
    const headSha = f.commit('squash me');
    git(f.repo, 'checkout', 'main');
    git(f.repo, 'merge', '--squash', 'squashed');
    git(f.repo, 'commit', '-m', 'squash merge');
    const mergeSha = git(f.repo, 'rev-parse', 'HEAD');
    git(f.repo, 'push', 'origin', 'main', 'squashed');
    f.state.mergedRequests = [{ number: '7', sourceRepository: 'team/repo', sourceBranch: 'squashed', targetBranch: 'main', headSha, mergeSha }];
    let plan = await f.inspect();
    expect(plan.candidates.filter((entry) => entry.name === 'squashed').every((entry) => entry.classification === 'merged' && !entry.requiresForce)).toBe(true);
    expect(plan.candidates.find((entry) => entry.name === 'squashed')?.reasons[0]).toEqual({ code: 'merged-request', detail: '#7' });
    const newer = git(f.repo, 'commit-tree', git(f.repo, 'write-tree'), '-p', headSha, '-m', 'work after squash');
    git(f.repo, 'update-ref', 'refs/heads/squashed', newer);
    git(f.repo, 'push', 'origin', 'squashed');
    plan = await f.inspect();
    expect(plan.candidates.filter((entry) => entry.name === 'squashed').every((entry) => entry.classification === 'other')).toBe(true);
  });

  test('offers remote orphan candidates only after 90 days and requires the additional confirmation', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    vi.stubEnv('GIT_AUTHOR_DATE', '2020-01-01T12:00:00Z');
    vi.stubEnv('GIT_COMMITTER_DATE', '2020-01-01T12:00:00Z');
    const dormant = git(f.repo, 'commit-tree', git(f.repo, 'write-tree'), '-p', f.initial, '-m', 'dormant work');
    vi.stubEnv('GIT_AUTHOR_DATE', undefined);
    vi.stubEnv('GIT_COMMITTER_DATE', undefined);
    git(f.repo, 'push', 'origin', `${dormant}:refs/heads/dormant`);
    f.state.now = Date.parse('2020-03-30T12:00:00Z');
    let plan = await f.inspect();
    expect(plan.candidates.find((entry) => entry.name === 'dormant')?.classification).toBe('other');
    f.state.now = Date.parse('2020-03-31T12:00:00Z');
    plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.name === 'dormant')!;
    expect(candidate).toMatchObject({ classification: 'orphaned', requiresForce: true, selectedByDefault: false, blocks: [] });
    await expect(f.execute(plan, [candidate])).rejects.toThrow('additional confirmation');
    expect((await f.execute(plan, [candidate], [candidate.id])).outcomes[0].status).toBe('deleted');
  });

  test('does not retry a deletion with an unknown network outcome and retains its local counterpart', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'paired');
    git(f.repo, 'push', 'origin', 'paired');
    const plan = await f.inspect();
    const selected = plan.candidates.filter((entry) => entry.name === 'paired');
    const original = lifecycle.runner.run.bind(lifecycle.runner);
    vi.spyOn(lifecycle.runner, 'run').mockImplementation((repo, args, options) => {
      if (args[0] === 'ls-remote' && args.includes('--refs')) return Promise.reject(new Error('Connection lost while verifying deletion.'));
      return original(repo, args, options);
    });
    const pushes = vi.spyOn(lifecycle.runner, 'runResult');
    const result = await f.execute(plan, selected);
    expect(result.outcomes.find((entry) => entry.kind === 'server')?.status).toBe('unknown');
    expect(result.outcomes.find((entry) => entry.kind === 'local')).toMatchObject({ status: 'skipped', message: 'server-not-deleted' });
    expect(pushes.mock.calls.filter(([, args]) => args[0] === 'push')).toHaveLength(1);
    expect(f.hasRef(f.server, 'refs/heads/paired')).toBe(false);
    expect(f.hasRef(f.repo, 'refs/heads/paired')).toBe(true);
  });

  test('classifies an orphan by its fetch upstream independently of a separate push server', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'checkout', '-b', 'orphaned');
    f.commit('unmerged orphan');
    git(f.repo, 'push', '-u', 'origin', 'orphaned');
    git(f.repo, 'checkout', 'main');
    const pushServer = f.bare('push-copy');
    git(pushServer, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(f.repo, 'push', pushServer, 'main', 'orphaned');
    git(f.server, 'update-ref', '-d', 'refs/heads/orphaned');
    git(f.repo, 'remote', 'set-url', '--push', 'origin', pushServer);
    const plan = await f.inspect();
    expect(plan.candidates.find((candidate) => candidate.kind === 'local' && candidate.name === 'orphaned')).toMatchObject({
      classification: 'orphaned',
      requiresForce: true,
      blocks: [],
    });
    expect(f.hasRef(pushServer, 'refs/heads/orphaned')).toBe(true);
  });

  test('preserves tracking refs if their remote configuration changes while deletion is running', async (lifecycle) => {
    const f = cleanupFixture(lifecycle);
    git(f.repo, 'branch', 'done');
    git(f.repo, 'push', 'origin', 'done');
    const other = f.bare('new-fetch-target');
    git(other, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(f.repo, 'push', other, 'main', 'done');
    const plan = await f.inspect();
    const candidate = plan.candidates.find((entry) => entry.kind === 'server' && entry.name === 'done')!;
    const original = f.remotes.delete.bind(f.remotes);
    vi.spyOn(f.remotes, 'delete').mockImplementation(async (...args) => {
      const result = await original(...args);
      git(f.repo, 'remote', 'set-url', 'origin', other);
      return result;
    });
    expect((await f.execute(plan, [candidate])).outcomes[0].status).toBe('deleted');
    expect(f.hasRef(f.repo, 'refs/remotes/origin/done')).toBe(true);
    expect(f.hasRef(other, 'refs/heads/done')).toBe(true);
  });
});
