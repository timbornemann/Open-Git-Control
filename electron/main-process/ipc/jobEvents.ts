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
  webContents.send(IpcChannel.JobEvent, event);
}
