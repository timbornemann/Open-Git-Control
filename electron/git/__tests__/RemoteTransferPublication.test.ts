import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { cleanupTransferFixtures, fixture, git } from './remoteTransferFixture';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
let lifecycle: GitIntegrationLifecycle | undefined;
afterEach(async () => {
  await lifecycle?.close();
  lifecycle = undefined;
  vi.restoreAllMocks();
  await cleanupTransferFixtures();
}, 60_000);

describe('publication of an existing task branch with real Git', () => {
  it('accepts a previously pushed branch as up to date and still publishes later commits', async () => {
    lifecycle = new GitIntegrationLifecycle();
    await lifecycle.track(
      (async () => {
        const f = fixture(lifecycle!);
        const remote = f.bare('origin');
        const branch = 'task/fix';
        git(f.repo, 'remote', 'add', 'origin', remote);
        git(f.repo, 'checkout', '-b', branch);
        git(f.repo, 'push', '--set-upstream', 'origin', branch);
        const input = { repoPath: f.repo, remoteNames: ['origin'], sourceBranch: branch, destinationBranch: branch, expectedBranch: branch };
        const existing = await f.service.planPush(f.repo, input, f.context);
        const repeated = await f.service.executePush(f.repo, existing.id, f.context);
        expect(repeated.state).toBe('success');
        expect(repeated.targets).toHaveLength(1);
        expect(repeated.targets[0].status).toBe('up-to-date');
        expect(f.ref(remote, `refs/heads/${branch}`)).toBe(f.initial);
        const next = f.commit('more task work');
        const updated = await f.service.planPush(f.repo, input, f.context);
        const published = await f.service.executePush(f.repo, updated.id, f.context);
        expect(published.state).toBe('success');
        expect(published.targets[0].status).toBe('success');
        expect(f.ref(remote, `refs/heads/${branch}`)).toBe(next);
        expect(git(f.repo, 'branch', '--show-current')).toBe(branch);
      })(),
    );
  }, 60_000);
});
