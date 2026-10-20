import { ipcMain } from 'electron';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { UserNotesManager } from '../UserNotesManager';

export function registerUserNotesHandlers(manager: UserNotesManager): void {
  ipcMain.handle(IpcChannel.UserNotesGetStatus, () => manager.getStatus());
  ipcMain.handle(IpcChannel.UserNotesCheck, () => manager.check());
  ipcMain.handle(IpcChannel.UserNotesAcknowledge, (_event, identities) => manager.acknowledge(identities));
  ipcMain.handle(IpcChannel.UserNotesGetNote, async (_event, identity) => {
    try {
      return { success: true, data: await manager.getNote(identity) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
