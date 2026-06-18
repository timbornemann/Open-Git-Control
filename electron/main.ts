import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { aiService } from './AiService';
import { CommitStatsService } from './CommitStatsService';
import { gitService } from './GitService';
import { githubService } from './GitHubService';
import { SecretScanService } from './SecretScanService';
import { WorkingTreeService } from './WorkingTreeService';
import { buildDiagnosticsReportFactory } from './main-process/diagnostics';
import { setupIPC } from './main-process/ipc/setupIPC';
import { getGeminiApiKeyFromSecureStore, readSettingsWithMigration } from './main-process/settingsStore';
import { UpdaterManager } from './main-process/updaterManager';
import { createMainWindow } from './main-process/windowFactory';
import { PlanningApiServerHandle, startPlanningApiServer } from './main-process/planningApiServer';

console.log('--- MAIN PROCESS START ---');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);

const isDev = process.env.NODE_ENV === 'development';
const APP_DISPLAY_NAME = 'Open-Git-Control';
const WINDOWS_APP_ID = 'com.opengitcontrol.app';

const updaterManager = new UpdaterManager(isDev);
let planningApiServer: PlanningApiServerHandle | null = null;
const secretScanService = new SecretScanService(gitService);
const workingTreeService = new WorkingTreeService(gitService);
const commitStatsService = new CommitStatsService(
  gitService,
  () => path.join(app.getPath('userData'), 'commit-stats-v1.jsonl'),
);

const buildDiagnosticsReport = buildDiagnosticsReportFactory({
  gitService,
  githubService,
  readSettingsWithMigration,
  getUpdaterStatus: () => updaterManager.getStatus(),
  getCommitStatsDiagnostics: () => commitStatsService.getDiagnostics(),
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
    commitStatsService,
    workingTreeService,
    updaterManager,
    readSettingsWithMigration,
    getGeminiApiKeyFromSecureStore,
    buildDiagnosticsReport,
  });

  createMainWindow(isDev, APP_DISPLAY_NAME, __dirname);
  updaterManager.configureAutoUpdates();
  if (process.env.OPEN_GIT_CONTROL_API_DISABLED !== 'true') {
    void startPlanningApiServer()
      .then((server) => {
        planningApiServer = server;
        console.log(`[planning-api] Listening at ${server.url}/api/`);
      })
      .catch((error) => {
        console.error('[planning-api] Failed to start:', error);
      });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(isDev, APP_DISPLAY_NAME, __dirname);
    }
  });
});

app.on('before-quit', () => {
  updaterManager.dispose();
  if (planningApiServer) {
    void planningApiServer.close().catch((error) => {
      console.error('[planning-api] Failed to stop:', error);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
