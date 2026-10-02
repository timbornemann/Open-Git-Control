import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { vi } from 'vitest';
import { GitService } from '../../GitService';
import type { GitHubService } from '../../GitHubService';
import type { IpcMainInvokeEvent } from 'electron';
import { ReleaseTargetWorkflow } from '../ReleaseTargetWorkflow';
import { repoJobRegistry } from '../../main-process/repoJobRegistry';

const execute = promisify(execFile);
const roots: string[] = [];
export async function releaseRepository(options: { usePathAlias?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-release-target-'));
  roots.push(root);
  let repo = path.join(root, 'local');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(repo);
  if (options.usePathAlias) {
    const alias = path.join(root, 'linked-local');
    fs.symlinkSync(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
    repo = alias;
  }
  const run = async (args: string[], cwd = repo) => (await execute('git', args, { cwd, windowsHide: true })).stdout.trim();
  await run(['init', '--initial-branch=main']);
  await run(['config', 'user.name', 'Release Test']);
  await run(['config', 'user.email', 'release@example.test']);
  await run(['config', 'commit.gpgSign', 'false']);
  await run(['config', 'maintenance.auto', 'false']);
  await run(['config', 'gc.auto', '0']);
  await run(['init', '--bare', remote]);
  await run(['config', 'maintenance.auto', 'false'], remote);
  await run(['config', 'gc.auto', '0'], remote);
  const commit = async (text: string) => {
    fs.writeFileSync(path.join(repo, 'file.txt'), text);
    await run(['add', 'file.txt']);
    await run(['commit', '-m', text]);
    return run(['rev-parse', 'HEAD']);
  };
  const initial = await commit('initial');
  await run(['push', remote, 'main']);
  const url = 'https://github.com/acme/project.git';
  await run(['remote', 'add', 'origin', url]);
  const gitService = new GitService();
  gitService.setRepoPath(repo);
  // Match the path returned to the renderer after activation. Git resolves
  // macOS /var aliases, Windows short temp paths and directory links here.
  const activeRepo = gitService.getRepoPath();
  if (!activeRepo) throw new Error('Fixture repository was not activated.');
  repo = activeRepo;
  repoJobRegistry.cancelForRepoChange(repo);
  // Exercise the actual Git runner/scheduler against a local bare remote while
  // retaining a real GitHub identity at the authorization boundary.
  const exclusive = gitService.runner.withExclusiveWrite.bind(gitService.runner);
  vi.spyOn(gitService.runner, 'withExclusiveWrite').mockImplementation((cwd, command, work, signal) =>
    exclusive(
      cwd,
      command,
      (git) =>
        work({
          ...git,
          run: (directory, args, options) =>
            git.run(
              directory,
              args.map((arg) => (arg === url || (args[0] === 'push' && arg === 'origin') ? remote : arg)),
              options,
            ),
        }),
      signal,
    ),
  );
  const createRelease = vi.fn(async (_params: unknown) => ({
    id: 1,
    tagName: 'v1.0.0',
    name: 'Release',
    htmlUrl: '',
    draft: false,
    prerelease: false,
    publishedAt: null,
  }));
  const githubService = {
    isAuthenticated: vi.fn(() => true),
    getAuthenticationGeneration: vi.fn(() => 1),
    normalizeHost: (host: string) => host.toLowerCase(),
    createRelease,
    resolvePublishedReleaseCommit: vi.fn(async (_owner: string, _repo: string, ref: string) => {
      try {
        return await run(['rev-parse', '--verify', `${ref}^{commit}`], remote);
      } catch {
        return null;
      }
    }),
  };
  const pushGuard = { requirePushSecretScanApproval: vi.fn(async () => null as { success: false; error: string } | null), abortActiveScan: vi.fn() };
  const workflow = new ReleaseTargetWorkflow({ gitService, githubService: githubService as unknown as GitHubService, getHost: () => 'github.com', pushGuard });
  const event = { sender: { id: 1, once: vi.fn(), send: vi.fn() } } as unknown as IpcMainInvokeEvent;
  const params = { owner: 'acme', repo: 'project', repoPath: repo, tagName: 'v1.0.0', releaseName: 'Release', targetCommitish: 'main', body: 'Notes' };
  const create = async (mode: 'remote' | 'push-local', request = params) => {
    const inspected = await workflow.inspect(event, request);
    return workflow.create(event, { ...request, targetInspection: { id: inspected.inspectionId, mode } });
  };
  return { repo, remote, run, initial, commit, gitService, githubService, pushGuard, workflow, event, params, create, createRelease };
}

export async function cleanReleaseRepositories() {
  for (const root of [...roots]) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-release-target-'))
      throw new Error('Invalid fixture cleanup path.');
    await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    roots.splice(roots.indexOf(root), 1);
  }
}
