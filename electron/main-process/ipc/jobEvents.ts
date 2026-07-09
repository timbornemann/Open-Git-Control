import { IpcChannel } from '../../../src/types/ipcContract';
export type JobEventStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';

export type JobEventPayload = {
  id: string;
  operation: string;
  status: JobEventStatus;
  message?: string;
  progress?: number;
  details?: Record<string, unknown>;
  timestamp: number;
};

export function emitJobEvent(webContents: Electron.WebContents, event: JobEventPayload): void {
  try {
    if (!webContents || webContents.isDestroyed?.()) return;
    webContents.send(IpcChannel.JobEvent, event);
  } catch (error: any) {
    if (/object has been destroyed/i.test(String(error?.message || ''))) return;
    throw error;
  }
}
