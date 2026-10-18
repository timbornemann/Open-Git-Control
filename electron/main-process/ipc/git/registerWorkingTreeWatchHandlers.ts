import { ipcMain, type WebContents } from 'electron';
import type { GitService } from '../../../GitService';
import { WorkingTreeWatcher } from '../../WorkingTreeWatcher';
import { requireActiveRepositoryPath, repositoryPathKey } from '../../activeRepositoryAuthorization';
import { sendToWebContents } from '../jobEvents';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { WorkingTreeWatchRequest } from '../../../../src/shared/ipc/workingTreeWatch';

type Watch = Pick<WorkingTreeWatcher, 'start' | 'dispose' | 'recursive'>;
type Owner = { repoPath: string; subscriptions: Set<string>; watcher: Watch; ready: Promise<void>; destroyed: () => void };

/** A window's subscriptions share one monitor; no renderer-supplied filesystem paths are watched outside the active repository. */
export function registerWorkingTreeWatchHandlers(
  gitService: Pick<GitService, 'getRepoPath' | 'runner'>,
  create: (repoPath: string, changed: (rescan: boolean) => void) => Watch = (repoPath, changed) => new WorkingTreeWatcher(repoPath, gitService.runner, changed),
) {
  const owners = new Map<WebContents, Owner>();
  const close = (sender: WebContents, owner: Owner) => {
    owner.watcher.dispose();
    if (owners.get(sender) === owner) owners.delete(sender);
    sender.removeListener?.('destroyed', owner.destroyed);
  };
  ipcMain.handle(IpcChannel.GitWorkingTreeWatch, async (event, input: unknown) => {
    try {
      const value = input as WorkingTreeWatchRequest | null;
      if (
        !value ||
        typeof value.repoPath !== 'string' ||
        !value.repoPath.trim() ||
        typeof value.enabled !== 'boolean' ||
        typeof value.subscriptionId !== 'string' ||
        !/^[a-zA-Z0-9-]{1,100}$/.test(value.subscriptionId)
      )
        throw new Error('Invalid working tree watch request.');
      const sender = event.sender;
      if (sender.isDestroyed?.()) throw new Error('Window is closed.');
      let owner = owners.get(sender);
      if (!value.enabled) {
        if (owner && repositoryPathKey(owner.repoPath) === repositoryPathKey(value.repoPath)) {
          owner.subscriptions.delete(value.subscriptionId);
          if (!owner.subscriptions.size) close(sender, owner);
        }
        return { success: true, data: { recursive: false } };
      }
      const repoPath = requireActiveRepositoryPath(value.repoPath, gitService.getRepoPath(), IpcChannel.GitWorkingTreeWatch);
      if (owner && repositoryPathKey(owner.repoPath) !== repositoryPathKey(repoPath)) {
        close(sender, owner);
        owner = undefined;
      }
      if (!owner) {
        const watcher = create(repoPath, (rescan) => {
          if (owners.get(sender)?.watcher !== watcher || repositoryPathKey(gitService.getRepoPath() || '') !== repositoryPathKey(repoPath)) return;
          sendToWebContents(sender, IpcChannel.GitWorkingTreeChanged, { repoPath, ...(rescan ? { rescan: true } : {}) });
        });
        const current: Owner = { repoPath, subscriptions: new Set(), watcher, ready: Promise.resolve(), destroyed: () => close(sender, current) };
        owners.set(sender, current);
        sender.once?.('destroyed', current.destroyed);
        current.ready = watcher.start();
        owner = current;
      }
      if (owner.subscriptions.size >= 16 && !owner.subscriptions.has(value.subscriptionId)) throw new Error('Too many working tree subscriptions.');
      owner.subscriptions.add(value.subscriptionId);
      await owner.ready;
      if (owners.get(sender) !== owner) return { success: true, data: { recursive: false } };
      requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.GitWorkingTreeWatch);
      return { success: true, data: { recursive: owner.watcher.recursive } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not watch the working tree.' };
    }
  });
  return () => {
    for (const [sender, owner] of owners) close(sender, owner);
  };
}
