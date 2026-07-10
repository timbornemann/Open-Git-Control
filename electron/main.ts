import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { aiService } from './AiService';
import { CommitStatsService } from './CommitStatsService';
import { gitService } from './GitService';
import { githubService } from './GitHubService';
import { SecretScanService } from './SecretScanService';
import { WorkingTreeService } from './WorkingTreeService';
import { buildDiagnosticsReportFactory } from './main-process/diagnostics';
import { setupIPC } from './main-process/ipc/setupIPC';
import { getGeminiApiKeyFromSecureStore, getOpenAiApiKeyFromSecureStore, readSettingsWithMigration } from './main-process/settingsStore';
import { UpdaterManager } from './main-process/updaterManager';
import { createMainWindow } from './main-process/windowFactory';
import type { PlanningApiServerHandle } from './main-process/planningApiServer';
import { startPlanningApiServer } from './main-process/planningApiServer';
import { enforceProductionCommandLineSecurity, installAppSecurity } from './main-process/security';
import { acquireSingleInstanceLock } from './main-process/singleInstance';
import { IpcChannel } from '../src/types/ipcContract';
import type { PlanningApiTokenLifetime } from './main-process/planningApiAuth';
import { clearSavedPlanningApiAuthToken, generateSavedPlanningApiAuthToken, getPlanningApiAuthState } from './main-process/planningApiAuth';

// Development mode must never be reachable in an installed/packaged binary,
// regardless of an inherited NODE_ENV. A packaged app in "dev mode" would load
// the localhost dev server, open DevTools and apply the relaxed dev CSP.
// app.isPackaged is the authoritative signal for a built application.
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
const APP_DISPLAY_NAME = 'Open-Git-Control';
const WINDOWS_APP_ID = 'com.opengitcontrol.app';

const openMainWindowIfReady = () => {
  if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(isDev, APP_DISPLAY_NAME, __dirname);
  }
};

const isPrimaryInstance = acquireSingleInstanceLock(app, BrowserWindow, openMainWindowIfReady);

if (isPrimaryInstance) {
  const updaterManager = new UpdaterManager(isDev);
  let planningApiServer: PlanningApiServerHandle | null = null;
  let planningApiError: string | null = null;
  const preferredPlanningApiPort = (() => {
    const parsed = Number(process.env.OPEN_GIT_CONTROL_API_PORT || '2990');
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2990;
  })();
  const secretScanService = new SecretScanService(gitService);
  const workingTreeService = new WorkingTreeService(gitService);
  const commitStatsService = new CommitStatsService(gitService, () => path.join(app.getPath('userData'), 'commit-stats-v1.jsonl'));

  const buildDiagnosticsReport = buildDiagnosticsReportFactory({
    gitService,
    githubService,
    readSettingsWithMigration,
    getUpdaterStatus: () => updaterManager.getStatus(),
    getCommitStatsDiagnostics: () => commitStatsService.getDiagnostics(),
  });

  const isPlanningApiTokenLifetime = (value: unknown): value is PlanningApiTokenLifetime =>
    value === 'day' || value === 'month' || value === 'year' || value === 'forever';

  const buildPlanningApiInfo = () => {
    const disabled = process.env.OPEN_GIT_CONTROL_API_DISABLED === 'true';
    const serverUrl = planningApiServer?.url || null;
    const parsedUrl = serverUrl ? new URL(serverUrl) : null;
    const normalizedBaseUrl = serverUrl ? `${serverUrl}/api/` : null;
    const authState = getPlanningApiAuthState();

    return {
      enabled: !disabled,
      status: disabled ? 'disabled' : planningApiServer ? 'running' : planningApiError ? 'error' : 'starting',
      host: parsedUrl?.hostname || '127.0.0.1',
      port: parsedUrl ? Number(parsedUrl.port) : null,
      preferredPort: preferredPlanningApiPort,
      baseUrl: serverUrl,
      apiUrl: normalizedBaseUrl,
      mcpUrl: serverUrl ? `${serverUrl}/mcp` : null,
      docsUrl: normalizedBaseUrl,
      openApiUrl: serverUrl ? `${serverUrl}/api/openapi.json` : null,
      authRequired: true,
      authHeaderName: planningApiServer?.authHeaderName || 'x-open-git-control-token',
      authToken: authState.token,
      authTokenSource: authState.source,
      authTokenCreatedAt: authState.createdAt,
      authTokenExpiresAt: authState.expiresAt,
      authTokenPersistent: authState.persistent,
      authTokenManageable: authState.manageable,
      authTokenStorageAvailable: authState.storageAvailable,
      ...(planningApiError ? { error: planningApiError } : {}),
    };
  };

  console.log('--- MAIN PROCESS START ---');
  console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);

  enforceProductionCommandLineSecurity(isDev);

  ipcMain.handle(IpcChannel.PlanningApiGetInfo, async () => {
    return buildPlanningApiInfo();
  });

  ipcMain.handle(IpcChannel.PlanningApiGenerateToken, async (_event, lifetime: unknown) => {
    if (!isPlanningApiTokenLifetime(lifetime)) {
      throw new Error('Invalid Planning API token lifetime.');
    }
    generateSavedPlanningApiAuthToken(lifetime);
    return buildPlanningApiInfo();
  });

  ipcMain.handle(IpcChannel.PlanningApiClearSavedToken, async () => {
    clearSavedPlanningApiAuthToken();
    return buildPlanningApiInfo();
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
      getOpenAiApiKeyFromSecureStore,
      buildDiagnosticsReport,
    });

    installAppSecurity({ isDev, mainProcessDir: __dirname });
    openMainWindowIfReady();
    updaterManager.configureAutoUpdates(readSettingsWithMigration().autoUpdateEnabled);
    if (process.env.OPEN_GIT_CONTROL_API_DISABLED !== 'true') {
      void startPlanningApiServer({
        authTokenProvider: () => getPlanningApiAuthState().token,
        serverVersion: app.getVersion(),
      })
        .then((server) => {
          planningApiServer = server;
          planningApiError = null;
          console.log(`[planning-api] Listening at ${server.url}/api/`);
        })
        .catch((error) => {
          planningApiError = error instanceof Error ? error.message : String(error);
          console.error('[planning-api] Failed to start:', error);
        });
    }

    app.on('activate', openMainWindowIfReady);
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
}
