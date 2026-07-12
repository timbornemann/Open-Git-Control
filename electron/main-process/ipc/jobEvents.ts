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

let emittedJobEventSequence = 0;

export function emitJobEvent(webContents: Electron.WebContents, event: JobEventPayload): void {
  try {
    if (!webContents || webContents.isDestroyed?.()) return;
    webContents.send(IpcChannel.JobEvent, {
      ...event,
      // A job emits multiple lifecycle and progress events. Timestamps only
      // have millisecond precision, so they cannot safely identify a list row.
      eventId: `${event.id}-${event.timestamp}-${++emittedJobEventSequence}`,
    });
  } catch (error: any) {
    if (/object has been destroyed/i.test(String(error?.message || ''))) return;
    throw error;
  }
}

/**
 * Best-effort IPC send that never throws when the target window has been
 * destroyed. Long-running operations (e.g. clone progress) can emit after the
 * user closed or reloaded the window; an unguarded send would otherwise raise
 * an uncaught exception in the main process.
 */
export function sendToWebContents(webContents: Electron.WebContents, channel: string, ...args: unknown[]): void {
  try {
    if (!webContents || webContents.isDestroyed?.()) return;
    webContents.send(channel, ...args);
  } catch (error: any) {
    if (/object has been destroyed/i.test(String(error?.message || ''))) return;
    throw error;
  }
}
