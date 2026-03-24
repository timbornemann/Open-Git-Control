import { app, BrowserWindow } from 'electron';
console.log('--- MAIN PROCESS START ---');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
import { aiService } from './AiService';
import { gitService } from './GitService';
import { githubService } from './GitHubService';
import { SecretScanService } from './SecretScanService';
import { buildDiagnosticsReportFactory } from './main-process/diagnostics';
import { setupIPC } from './main-process/ipc/setupIPC';
import { getGeminiApiKeyFromSecureStore, readSettingsWithMigration } from './main-process/settingsStore';
import { UpdaterManager } from './main-process/updaterManager';
import { createMainWindow } from './main-process/windowFactory';

const isDev = process.env.NODE_ENV === 'development';
const APP_DISPLAY_NAME = 'Open-Git-Control';
const WINDOWS_APP_ID = 'com.opengitcontrol.app';

const updaterManager = new UpdaterManager(isDev);
const secretScanService = new SecretScanService(gitService);

const buildDiagnosticsReport = buildDiagnosticsReportFactory({
  gitService,
  githubService,
  readSettingsWithMigration,
  getUpdaterStatus: () => updaterManager.getStatus(),
});

app.whenReady().then(() => {
  app.setName(APP_DISPLAY_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_ID);
  }

  setupIPC({
    gitService,
    githubService,
    aiService,
    secretScanService,
    updaterManager,
    readSettingsWithMigration,
    getGeminiApiKeyFromSecureStore,
    buildDiagnosticsReport,
  });

  createMainWindow(isDev, APP_DISPLAY_NAME, __dirname);
  updaterManager.configureAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(isDev, APP_DISPLAY_NAME, __dirname);
    }
  });
});

app.on('before-quit', () => {
  updaterManager.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
