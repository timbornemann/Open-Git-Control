import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { IpcChannel } from '../../../src/types/ipcContract';
import { REPOSITORY_RUN_ACTION_IDS } from '../../../src/types/repositoryRun';
import type { RepositoryRunActionId } from '../../../src/types/repositoryRun';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import type { RepositoryRunConfigService } from '../RepositoryRunConfigService';
import { RepositoryRunConfigWatcher } from '../RepositoryRunConfigWatcher';
import type { RepositoryRunService } from '../RepositoryRunService';

type Deps = {
  configService: RepositoryRunConfigService;
  runService: RepositoryRunService;
  readStoredRepoPaths: () => string[];
};

const isAction = (value: unknown): value is RepositoryRunActionId =>
  typeof value === 'string' && (REPOSITORY_RUN_ACTION_IDS as readonly string[]).includes(value);

export const registerRepositoryRunHandlers = ({ configService, runService, readStoredRepoPaths }: Deps): void => {
  const configWatchers = new Map<number, RepositoryRunConfigWatcher>();
  const requireStoredRepository = (value: unknown): string => {
    const requested = String(value || '').trim();
    const repo = readStoredRepoPaths().find((candidate) => repositoryPathKey(candidate) === repositoryPathKey(requested));
    if (!repo) throw new Error('Run commands are only available for saved repositories.');
    return repo;
  };

  const getConfigWatcher = (sender: WebContents): RepositoryRunConfigWatcher => {
    const existing = configWatchers.get(sender.id);
    if (existing) return existing;
    const watcher = new RepositoryRunConfigWatcher((repositoryPath) => {
      if (!sender.isDestroyed()) sender.send(IpcChannel.RepositoryRunConfigChanged, repositoryPath);
    });
    configWatchers.set(sender.id, watcher);
    sender.once('destroyed', () => {
      watcher.dispose();
      configWatchers.delete(sender.id);
    });
    return watcher;
  };

  ipcMain.handle(IpcChannel.RepositoryRunGetConfig, async (_event, repoPath: unknown) => {
    try {
      return { success: true as const, data: configService.read(requireStoredRepository(repoPath)) };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : 'Could not load run configuration.' };
    }
  });

  ipcMain.handle(IpcChannel.RepositoryRunSaveConfig, async (_event, repoPath: unknown, config: unknown) => {
    try {
      return { success: true as const, data: configService.write(requireStoredRepository(repoPath), config) };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : 'Could not save run configuration.' };
    }
  });

  ipcMain.handle(IpcChannel.RepositoryRunWatchConfig, async (event: IpcMainInvokeEvent, repoPath: unknown) => {
    try {
      const watcher = getConfigWatcher(event.sender);
      const requestedRepositoryPath = String(repoPath || '').trim();
      watcher.setRepository(requestedRepositoryPath ? requireStoredRepository(requestedRepositoryPath) : null);
      return { success: true as const, data: true };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : 'Could not watch run configuration.' };
    }
  });

  ipcMain.handle(IpcChannel.RepositoryRunStart, async (_event, repoPath: unknown, action: unknown) => {
    try {
      if (!isAction(action)) throw new Error('Unknown run action.');
      return { success: true as const, data: await runService.start(requireStoredRepository(repoPath), action) };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : 'Could not start command.' };
    }
  });

  ipcMain.handle(IpcChannel.RepositoryRunStop, async (_event, runId: unknown) => {
    return { success: true as const, data: runService.stop(typeof runId === 'string' ? runId : undefined) };
  });

  ipcMain.handle(IpcChannel.RepositoryRunGetState, async () => ({ success: true as const, data: runService.getState() }));
};
