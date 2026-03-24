import { ipcMain } from 'electron';

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
  ipcMain.handle('diagnostics:report', async () => {
    try {
      const data = await buildDiagnosticsReport();
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Diagnostics konnten nicht erstellt werden.' };
    }
  });
}
