import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../../GitService';
import { GitIntegrationLifecycle } from '../../../git/__tests__/gitIntegrationLifecycle';
import { fixture, git, cleanupTransferFixtures } from '../../../git/__tests__/remoteTransferFixture';
import { handleGitCommand } from '../gitCommandRouter';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  vi.restoreAllMocks();
  await cleanupTransferFixtures();
}, 60_000);
function repository() {
  const lifecycle = new GitIntegrationLifecycle();
  lifecycles.push(lifecycle);
  const f = fixture(lifecycle);
  let activeRepo = f.repo;
  const service = {
    runner: lifecycle.runner,
    requireActiveRepoPath: () => activeRepo,
    getRepoPath: () => activeRepo,
    runCommandAtPath: (repo: string, args: string[]) => lifecycle.runner.run(repo, args),
  } as unknown as GitService;
  const command = (args: string[]) => handleGitCommand({ sender: {} }, service, 'branch', args, f.repo);
  return {
    ...f,
    command,
    service,
    selectOtherRepo: () => {
      activeRepo = '/another-repository';
    },
  };
}

describe('local primary branch deletion through Git IPC', () => {
  it('preserves main and master while on a feature branch, including forced deletion', async () => {
    const f = repository();
    git(f.repo, 'branch', 'master');
    git(f.repo, 'checkout', '-b', 'feature');
    const config = git(f.repo, 'config', '--null', '--list');
    for (const name of ['main', 'master', 'MAIN', 'MASTER']) {
      for (const flag of ['-d', '-D']) {
        expect(await f.command([flag, name])).toMatchObject({ success: false, error: expect.stringContaining('[PROTECTED_BRANCH]') });
      }
    }
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/heads/master')).toBe(f.initial);
    expect(git(f.repo, 'symbolic-ref', '--short', 'HEAD')).toBe('feature');
    expect(git(f.repo, 'config', '--null', '--list')).toBe(config);
  }, 30_000);

  it('protects a custom remote default while allowing a feature branch that tracks that default', async () => {
    const f = repository();
    git(f.repo, 'branch', 'stable/release');
    git(f.repo, 'branch', 'local-base');
    git(f.repo, 'remote', 'add', 'upstream', 'https://offline.invalid/repo.git');
    git(f.repo, 'update-ref', 'refs/remotes/upstream/stable/release', f.initial);
    git(f.repo, 'symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/stable/release');
    git(f.repo, 'config', 'branch.local-base.remote', 'upstream');
    git(f.repo, 'config', 'branch.local-base.merge', 'refs/heads/stable/release');
    git(f.repo, 'checkout', '-b', 'feature');
    const names = await handleGitCommand({ sender: {} }, f.service, 'protectedBranches', [], f.repo);
    expect(names).toMatchObject({ success: true, data: expect.stringContaining('stable/release') });
    expect(await f.command(['-D', 'stable/release'])).toMatchObject({ success: false, error: expect.stringContaining('[PROTECTED_BRANCH]') });
    expect(git(f.repo, 'rev-parse', 'refs/heads/stable/release')).toBe(f.initial);
    expect(await f.command(['-d', 'local-base'])).toMatchObject({ success: true });
  }, 30_000);

  it('protects the configured default branch without requiring a remote connection', async () => {
    const f = repository();
    git(f.repo, 'config', 'init.defaultBranch', 'trunk');
    git(f.repo, 'branch', 'trunk');
    git(f.repo, 'checkout', '-b', 'feature');
    expect(await f.command(['-d', 'trunk'])).toMatchObject({ success: false, error: expect.stringContaining('[PROTECTED_BRANCH]') });
    expect(git(f.repo, 'rev-parse', 'refs/heads/trunk')).toBe(f.initial);
  }, 30_000);

  it('still deletes merged feature branches offline and requires force for unmerged feature work', async () => {
    const f = repository();
    git(f.repo, 'remote', 'add', 'origin', 'https://offline.invalid/repo.git');
    git(f.repo, 'branch', 'finished');
    expect(await f.command(['-d', 'finished'])).toMatchObject({ success: true });
    git(f.repo, 'checkout', '-b', 'unfinished');
    f.commit('feature-only work');
    git(f.repo, 'checkout', 'main');
    expect(await f.command(['-d', 'unfinished'])).toMatchObject({ success: false, error: expect.stringMatching(/not fully merged/) });
    expect(await f.command(['-D', 'unfinished'])).toMatchObject({ success: true });
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.initial);
  }, 30_000);

  it('rechecks the active repository before applying a deletion', async () => {
    const f = repository();
    git(f.repo, 'branch', 'finished');
    f.selectOtherRepo();
    expect(await f.command(['-d', 'finished'])).toMatchObject({ success: false, error: expect.stringContaining('not the active repository') });
    expect(git(f.repo, 'rev-parse', 'refs/heads/finished')).toBe(f.initial);
  }, 30_000);
});
