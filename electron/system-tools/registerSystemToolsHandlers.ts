import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import { isSystemToolId, type InstallSystemToolRequest } from '../../src/shared/ipc/systemTools';
import { isAllowedAppNavigation } from '../main-process/security';
import { systemToolsService, type SystemToolsService } from './SystemToolsService';

export function registerSystemToolsHandlers(options: { isDev: boolean; mainProcessDir: string }, service: SystemToolsService = systemToolsService): () => void {
  const trusted = (event: IpcMainInvokeEvent) =>
    Boolean(
      event.senderFrame &&
      event.senderFrame === event.sender.mainFrame &&
      BrowserWindow.fromWebContents(event.sender) &&
      isAllowedAppNavigation(event.senderFrame.url, options),
    );
  const requireTrusted = (event: IpcMainInvokeEvent) => {
    if (!trusted(event)) throw new Error('System tools are available only to the trusted app window.');
  };
  ipcMain.handle(IpcChannel.AppSystemToolsStatus, (event) => {
    requireTrusted(event);
    return service.snapshot();
  });
  ipcMain.handle(IpcChannel.AppSystemToolsRecheck, (event) => {
    requireTrusted(event);
    return service.recheck();
  });
  ipcMain.handle(IpcChannel.AppSystemToolInstall, async (event, request: InstallSystemToolRequest) => {
    if (!trusted(event)) return { success: false, error: 'Tool installation is available only to the trusted app window.' };
    if (!request || !isSystemToolId(request.toolId) || Object.keys(request).some((key) => key !== 'toolId' && key !== 'acceptAgreements'))
      return { success: false, error: 'Invalid system tool installation request.' };
    try {
      return { success: true, data: await service.install(request) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const send = (channel: IpcChannel, value: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && isAllowedAppNavigation(window.webContents.getURL(), options)) window.webContents.send(channel, value);
    }
  };
  const stopStatus = service.onStatus((status) => send(IpcChannel.AppSystemToolsChanged, status));
  const stopInstall = service.onInstall((event) => send(IpcChannel.AppSystemToolInstallation, event));
  return () => {
    stopStatus();
    stopInstall();
  };
}
