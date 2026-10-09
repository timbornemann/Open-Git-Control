import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import * as path from 'node:path';
import type { GitService } from '../../GitService';
import { RepositoryAnalyticsService } from '../../analytics/RepositoryAnalyticsService';
import type { AnalyticsRequest, AnalyticsDetailRequest } from '../../../src/shared/ipc/repositoryAnalytics';
import { IpcChannel } from '../../../src/types/ipcContract';
import { beginReadRequest } from '../readRequests';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';
import { repoJobRegistry } from '../repoJobRegistry';
import { isAllowedAppNavigation } from '../security';

export function registerRepositoryAnalyticsHandlers(gitService: GitService): void {
  const service = new RepositoryAnalyticsService(gitService, path.join(app.getPath('userData'), 'repository-analytics'));
  const controllers = new Map<number, AbortController>();
  const authorize = (event: IpcMainInvokeEvent, repoPath: string, channel: string) => {
    if (
      !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame ||
      !BrowserWindow.fromWebContents(event.sender) ||
      !isAllowedAppNavigation(event.senderFrame.url, { isDev: process.env.NODE_ENV === 'development', mainProcessDir: path.join(__dirname, '../..') })
    )
      throw new Error('Analytics requires the trusted app window.');
    return requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), channel);
  };
  ipcMain.handle(IpcChannel.GitAnalyticsSnapshot, async (event, request: AnalyticsRequest) => {
    try {
      return { success: true, data: service.snapshot({ ...request, repoPath: authorize(event, request.repoPath, IpcChannel.GitAnalyticsSnapshot) }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle(IpcChannel.GitAnalyticsRefresh, async (event, request: AnalyticsRequest) => {
    let read: ReturnType<typeof beginReadRequest> | undefined, job: ReturnType<typeof repoJobRegistry.begin> | undefined;
    let controller: AbortController | undefined;
    const closed = () => controller?.abort();
    try {
      const repoPath = authorize(event, request.repoPath, IpcChannel.GitAnalyticsRefresh);
      controllers.get(event.sender.id)?.abort();
      controller = new AbortController();
      controllers.set(event.sender.id, controller);
      read = beginReadRequest(event, request.readRequest);
      job = repoJobRegistry.begin(repoPath);
      event.sender.once('destroyed', closed);
      const signal = AbortSignal.any([controller.signal, read.signal, job.signal]);
      const data = await service.refresh({ ...request, repoPath }, signal, (progress) => {
        if (signal.aborted || gitService.getRepoPath() !== repoPath || event.sender.isDestroyed()) {
          controller?.abort();
          return;
        }
        event.sender.send(IpcChannel.GitAnalyticsProgress, progress);
      });
      signal.throwIfAborted();
      job.ensureActive();
      authorize(event, repoPath, IpcChannel.GitAnalyticsRefresh);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      read?.finish();
      job?.complete();
      event.sender.removeListener('destroyed', closed);
      if (controllers.get(event.sender.id) === controller) controllers.delete(event.sender.id);
    }
  });
  ipcMain.handle(IpcChannel.GitAnalyticsDetails, async (event, request: AnalyticsDetailRequest) => {
    try {
      return { success: true, data: service.details({ ...request, repoPath: authorize(event, request.repoPath, IpcChannel.GitAnalyticsDetails) }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
