import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../../../GitService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { ReadRequest } from '../../../../src/shared/cache/resource';
import { countPorcelainChanges } from '../../../../src/shared/git/porcelainStatus';
import { repositoryPathKey } from '../../activeRepositoryAuthorization';
import { beginReadRequest } from '../../readRequests';

type Dependencies = { gitService: Pick<GitService, 'getRepoPath' | 'runner'>; readStoredRepoPaths: () => string[] };

export function registerRepositoryActivityHandler({ gitService, readStoredRepoPaths }: Dependencies) {
  ipcMain.handle(IpcChannel.GitRepositoryChangeSummary, async (event: IpcMainInvokeEvent, requestedPath: unknown, readRequest?: ReadRequest) => {
    const request = beginReadRequest(event, readRequest);
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(), 10_000);
    const signal = AbortSignal.any([request.signal, deadline.signal]);
    try {
      if (typeof requestedPath !== 'string' || !requestedPath.trim()) throw new Error('Repository path is required.');
      const requestedKey = repositoryPathKey(requestedPath);
      const activePath = gitService.getRepoPath();
      const repoPath = [activePath, ...readStoredRepoPaths()].find((candidate) => candidate && repositoryPathKey(candidate) === requestedKey);
      if (!repoPath) throw new Error('Requested repository is not an open repository.');
      const run = (args: string[]) => gitService.runner.run(repoPath, ['--no-optional-locks', ...args], { signal, requestedKind: 'background' });
      // Async even on a cold repository; never select it or run full snapshot/stat work.
      const bare = (await run(['rev-parse', '--is-bare-repository'])).trim() === 'true';
      const raw = bare ? '' : await run(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']);
      signal.throwIfAborted();
      return { success: true, data: { repoPath, changeCount: countPorcelainChanges(raw), checkedAt: Date.now() } };
    } catch (error) {
      return { success: false, error: deadline.signal.aborted ? 'Repository status check timed out.' : error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timeout);
      request.finish();
    }
  });
}
