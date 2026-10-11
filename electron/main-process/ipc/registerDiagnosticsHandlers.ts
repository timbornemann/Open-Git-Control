import { clipboard, ipcMain } from 'electron';
import { IpcChannel } from '../../../src/types/ipcContract';

type RegisterDiagnosticsHandlersDeps = {
  buildDiagnosticsReport: () => Promise<{
    generatedAt: string;
    appVersion: string;
    platform: string;
    activeRepo: string | null;
    report: string;
  }>;
};

export function registerDiagnosticsHandlers({ buildDiagnosticsReport }: RegisterDiagnosticsHandlersDeps): void {
  // Sender validation restricts this native operation to the trusted app window.
  ipcMain.handle(IpcChannel.ClipboardWriteText, async (_event, text: unknown) => {
    if (typeof text !== 'string' || !text || Buffer.byteLength(text, 'utf8') > 8 * 1024 ** 2) {
      return { success: false, error: 'Clipboard text must be non-empty and at most 8 MiB.' };
    }
    try {
      await clipboard.writeText(text);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not write to the system clipboard.' };
    }
  });
  ipcMain.handle(IpcChannel.DiagnosticsReport, async () => {
    try {
      const data = await buildDiagnosticsReport();
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Diagnostics konnten nicht erstellt werden.' };
    }
  });
}
