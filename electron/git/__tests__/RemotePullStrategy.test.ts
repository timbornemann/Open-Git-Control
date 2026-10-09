import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import type { PullMode } from '../../../src/types/remoteTransfers';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const fixtures: Array<{ root: string; lifecycle: GitIntegrationLifecycle }> = [];
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(os.tmpdir(), 'ogc-unused-pull-global'));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
});
afterEach(async () => {
  for (const { root, lifecycle } of fixtures.splice(0)) {
    await lifecycle.close();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-pull-strategy-')) throw new Error('Unexpected fixture root.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  vi.unstubAllEnvs();
});
async function fixture() {
  const lifecycle = new GitIntegrationLifecycle();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-pull-strategy-'));
  fixtures.push({ root, lifecycle });
  const git = (repo: string, ...args: string[]) => lifecycle.git(repo, ...args);
  const repo = path.join(root, 'working');
  const peer = path.join(root, 'publisher');
  const target = path.join(root, 'target.git');
  for (const dir of [repo, target]) fs.mkdirSync(dir);
  await git(target, 'init', '--bare', '-b', 'main');
  await git(repo, 'init', '-b', 'main');
  const configure = async (cwd: string) => {
    await git(cwd, 'config', 'user.name', 'Pull Test');
    await git(cwd, 'config', 'user.email', 'pull@example.invalid');
    await git(cwd, 'config', 'commit.gpgsign', 'false');
    await git(cwd, 'config', 'core.editor', 'false');
  };
  await configure(repo);
  const commit = async (cwd: string, name: string) => {
    fs.writeFileSync(path.join(cwd, `${name}.txt`), name);
    await git(cwd, 'add', '--', `${name}.txt`);
    await git(cwd, 'commit', '-m', name);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  const initial = await commit(repo, 'initial');
  await git(repo, 'remote', 'add', 'origin', target);
  await git(repo, 'push', '-u', 'origin', 'main');
  await git(root, 'clone', target, peer);
  await configure(peer);
  const remoteCommit = await commit(peer, 'remote');
  await git(peer, 'push', 'origin', 'main');
  const runner = lifecycle.runner;
  const service = new RemoteTransferService(runner, new RemotePreferencesStore(() => path.join(root, 'preferences.json')));
  const context: RemoteTransferContext = { ownerId: 1, generation: 0, signal: lifecycle.signal, ensureActive: () => lifecycle.signal.throwIfAborted() };
  const pull = (mode: PullMode) => service.pull(repo, { repoPath: repo, remote: 'origin', branch: 'main', mode }, context);
  return { root, repo, git, commit, initial, remoteCommit, runner, service, pull };
}

describe('pull strategies with real Git', () => {
  it.each<PullMode>(['default', 'rebase', 'merge', 'ff-only', 'no-ff'])(
    'uses %s without changing tracking or saved Git configuration',
    async (mode) => {
      const f = await fixture();
      await f.git(f.repo, 'config', 'pull.rebase', 'true');
      await f.git(f.repo, 'config', 'pull.ff', 'only');
      const local = await f.commit(f.repo, 'local');
      const configBefore = fs.readFileSync(path.join(f.repo, '.git', 'config'), 'utf8');
      const streamed = vi.spyOn(f.runner, 'streamOutput');
      if (mode === 'default' || mode === 'ff-only') {
        await expect(f.pull(mode)).rejects.toThrow(/fast-forward/i);
        expect(await f.git(f.repo, 'rev-parse', 'HEAD')).toBe(local);
      } else {
        await f.pull(mode);
        const parents = (await f.git(f.repo, 'rev-list', '--parents', '-1', 'HEAD')).split(' ');
        if (mode === 'rebase') {
          expect(parents).toHaveLength(2);
          expect(parents[1]).toBe(f.remoteCommit);
          expect(parents[0]).not.toBe(local);
        } else {
          expect(parents.slice(1)).toEqual([local, f.remoteCommit]);
        }
      }
      const expected = mode === 'default' ? [] : mode === 'merge' ? ['--no-rebase'] : mode === 'no-ff' ? ['--no-rebase', '--no-ff'] : [`--${mode}`];
      expect(streamed.mock.calls[0][1]).toEqual(['pull', ...expected, '--no-recurse-submodules', '--', 'origin', 'main']);
      expect(fs.readFileSync(path.join(f.repo, '.git', 'config'), 'utf8')).toBe(configBefore);
      expect(await f.git(f.repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main');
    },
    30_000,
  );

  it('creates a merge commit on a fast-forwardable branch for no-ff despite a configured rebase', async () => {
    const f = await fixture();
    await f.git(f.repo, 'config', 'pull.rebase', 'true');
    await f.pull('no-ff');
    expect((await f.git(f.repo, 'rev-list', '--parents', '-1', 'HEAD')).split(' ').slice(1)).toEqual([f.initial, f.remoteCommit]);
  }, 30_000);

  it('reads effective included and branch configuration freshly and lets Git default use it', async () => {
    const f = await fixture();
    const included = path.join(f.root, 'included.gitconfig');
    fs.writeFileSync(included, '[pull]\n\trebase = true\n[merge]\n\tff = false\n');
    await f.git(f.repo, 'config', 'include.path', included);
    expect(await f.service.getPullConfiguration(f.repo)).toEqual({
      branch: 'main',
      rebase: { key: 'pull.rebase', value: 'true' },
      fastForward: null,
      mergeOptions: null,
    });
    await f.git(f.repo, 'config', 'branch.main.rebase', 'false');
    expect(await f.service.getPullConfiguration(f.repo)).toMatchObject({
      rebase: { key: 'branch.main.rebase', value: 'false' },
      fastForward: { key: 'merge.ff', value: 'false' },
    });
    const local = await f.commit(f.repo, 'local');
    await f.pull('default');
    expect((await f.git(f.repo, 'rev-list', '--parents', '-1', 'HEAD')).split(' ').slice(1)).toEqual([local, f.remoteCommit]);
    await f.git(f.repo, 'checkout', '-b', 'other');
    expect(await f.service.getPullConfiguration(f.repo)).toMatchObject({ branch: 'other', rebase: { key: 'pull.rebase', value: 'true' }, fastForward: null });
  }, 30_000);
});
