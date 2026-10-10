import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { vi } from 'vitest';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import type { GitIntegrationLifecycle } from './gitIntegrationLifecycle';

const directories: string[] = [];
export async function cleanupTransferFixtures() {
  for (const directory of directories.splice(0)) {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-transfers-')) {
      throw new Error('Unsafe transfer test cleanup');
    }
    await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

export const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

export function fixture(lifecycle: GitIntegrationLifecycle) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-transfers-'));
  directories.push(root);
  const repo = path.join(root, 'working');
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'maintenance.auto', 'false');
  git(repo, 'config', 'gc.auto', '0');
  git(repo, 'config', 'user.name', 'Transfer Test');
  git(repo, 'config', 'user.email', 'transfer@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const commit = (content: string) => {
    fs.writeFileSync(path.join(repo, 'file.txt'), content);
    git(repo, 'add', 'file.txt');
    git(repo, 'commit', '-m', content);
    return git(repo, 'rev-parse', 'HEAD');
  };
  const initial = commit('initial');
  const bare = (name: string) => {
    const target = path.join(root, `${name}.git`);
    fs.mkdirSync(target);
    git(target, 'init', '--bare');
    return target;
  };
  const store = new RemotePreferencesStore(() => path.join(root, 'preferences.json'));
  const service = new RemoteTransferService(lifecycle.runner, store);
  const context: RemoteTransferContext = {
    ownerId: 1,
    generation: 0,
    signal: lifecycle.signal,
    ensureActive: vi.fn(() => lifecycle.signal.throwIfAborted()),
    authorizePush: vi.fn(async () => {}),
  };
  const ref = (target: string, name = 'refs/heads/main') => git(repo, `--git-dir=${target}`, 'rev-parse', '--verify', name);
  return { root, repo, initial, commit, bare, store, service, context, ref, lifecycle };
}

export function olderGitService(f: ReturnType<typeof fixture>) {
  const runner = f.lifecycle.runner;
  const runResult = runner.runResult.bind(runner);
  const pushCommands: string[][] = [];
  vi.spyOn(runner, 'runResult').mockImplementation((repo, args, options) => {
    // Emulate a Git installation that does not reset multi-valued pushurl config.
    if (args[0] === 'remote' && options?.envOverrides?.GIT_CONFIG_VALUE_3 === 'https://ogc.invalid/probe-second.git')
      return Promise.resolve({ exitCode: 0, stdout: 'https://ogc.invalid/probe-first.git\nhttps://ogc.invalid/probe-second.git', stderr: '' });
    if (args[0] === 'push') pushCommands.push(args);
    return runResult(repo, args, options);
  });
  return { service: new RemoteTransferService(runner, f.store), pushCommands };
}
