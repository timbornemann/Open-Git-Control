import { ipcMain, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { isAllowedAppNavigation } from './security';

type IpcSecurityOptions = { isDev: boolean; mainProcessDir: string };
const protectedRegistries = new WeakSet<object>();

export function requireTrustedIpcSender(event: IpcMainInvokeEvent, options: IpcSecurityOptions): void {
  if (
    !event.senderFrame ||
    event.sender.isDestroyed() ||
    event.senderFrame !== event.sender.mainFrame ||
    !isAllowedAppNavigation(event.senderFrame.url, options)
  ) {
    throw new Error('IPC requests must originate from the trusted application window.');
  }
}

/** Install before any handlers, including the Planning API credential handlers. */
export function installIpcSenderValidation(options: IpcSecurityOptions, registry: Pick<IpcMain, 'handle'> = ipcMain): void {
  if (protectedRegistries.has(registry)) return;
  const register = registry.handle.bind(registry);
  // Guard registration once so existing and future feature handlers cannot
  // accidentally expose native operations to subframes or navigated windows.
  registry.handle = (channel, listener) => {
    register(channel, (event, ...args) => {
      requireTrustedIpcSender(event, options);
      return listener(event, ...args);
    });
  };
  protectedRegistries.add(registry);
}
