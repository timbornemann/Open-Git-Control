import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const roots: string[] = [];
afterEach(() => {
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
const fetchUrl = 'https://forge.test/team/repo.git';
const pushUrl = 'https://backup.test/team/repo.git';
function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-connection-check-'));
  roots.push(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', fetchUrl);
  git(repo, 'config', '--add', 'remote.origin.pushurl', pushUrl);
  const runner = new GitRunner();
  const store = new RemotePreferencesStore(() => path.join(repo, 'preferences.json'));
  store.write(repo, {
    bindings: [{ remoteName: 'origin', url: pushUrl, repository: { connectionId: 'backup-account', repositoryId: '1', fullPath: 'team/repo' } }],
  });
  const dispose = vi.fn();
  const credentials = vi.fn(async () => ({ envOverrides: { GIT_TEST_BROKER: 'selected-scope' }, dispose }));
  const service = new RemoteTransferService(runner, store, credentials, () => 7);
  const context: RemoteTransferContext = { ownerId: 1, generation: 0, ensureActive: vi.fn() };
  const input = { repoPath: repo, remote: 'origin', url: pushUrl, connectionId: 'backup-account' };
  const original = runner.run.bind(runner);
  const commands: string[][] = [];
  const network = vi.fn(async () => '');
  vi.spyOn(runner, 'run').mockImplementation((repoPath, args, options) => {
    commands.push(args);
    return args[0] === 'ls-remote' ? network() : original(repoPath, args, options);
  });
  return { repo, runner, service, context, input, credentials, dispose, commands, network };
}
describe('read-only connection rechecks', () => {
  it('probes only the failed push endpoint with its bound account and leaves Git state unchanged', async () => {
    const f = fixture();
    const before = git(f.repo, 'config', '--list');
    await expect(f.service.checkConnection(f.repo, f.input, f.context)).resolves.toBe(true);
    expect(f.commands.filter((args) => args[0] === 'ls-remote')).toEqual([['ls-remote', '--refs', '--', pushUrl, 'HEAD']]);
    expect(f.credentials).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'backup-account', urls: [pushUrl], expectedGeneration: 7, signal: expect.any(AbortSignal) }),
    );
    const read = vi.mocked(f.runner.run).mock.calls.find(([, args]) => args[0] === 'ls-remote')!;
    expect(read[2]?.envOverrides).toEqual({ GIT_TEST_BROKER: 'selected-scope' });
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.commands.some((args) => ['fetch', 'pull', 'push', 'update-ref'].includes(args[0]))).toBe(false);
    expect(git(f.repo, 'config', '--list')).toBe(before);
    expect(git(f.repo, 'for-each-ref', '--format=%(refname)')).toBe('');
  }, 15_000);
  it('rejects arbitrary or removed URLs and a reassigned account before connecting', async () => {
    const f = fixture();
    await expect(f.service.checkConnection(f.repo, { ...f.input, url: 'https://unrelated.test/repo' }, f.context)).rejects.toThrow('endpoint changed');
    await expect(f.service.checkConnection(f.repo, { ...f.input, connectionId: 'different-account' }, f.context)).rejects.toThrow('binding changed');
    expect(f.network).not.toHaveBeenCalled();
    expect(f.credentials).not.toHaveBeenCalled();
  }, 15_000);
  it('keeps system credentials selectable instead of substituting a hosting account', async () => {
    const f = fixture();
    await f.service.checkConnection(f.repo, { ...f.input, url: fetchUrl, connectionId: null }, f.context);
    expect(f.credentials).toHaveBeenCalledWith(expect.objectContaining({ connectionId: null, urls: [fetchUrl] }));
  }, 15_000);
  it('reports failures and releases the credential broker', async () => {
    const f = fixture();
    f.network.mockRejectedValue(new Error('fatal: Connection refused'));
    await expect(f.service.checkConnection(f.repo, f.input, f.context)).rejects.toThrow('Connection refused');
    expect(f.dispose).toHaveBeenCalledOnce();
  }, 15_000);
  it('rejects changed remote configuration during a successful check', async () => {
    const f = fixture();
    f.network.mockImplementation(async () => {
      git(f.repo, 'remote', 'set-url', '--push', 'origin', 'https://changed.test/repo');
      return '';
    });
    await expect(f.service.checkConnection(f.repo, f.input, f.context)).rejects.toThrow('configuration changed');
    expect(f.dispose).toHaveBeenCalledOnce();
  }, 15_000);
});
