import { ipcMain } from 'electron';
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
  ipcMain.handle(IpcChannel.DiagnosticsReport, async () => {
    try {
      const data = await buildDiagnosticsReport();
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Diagnostics konnten nicht erstellt werden.' };
    }
  });
}
