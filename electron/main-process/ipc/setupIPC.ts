import { AiService } from '../../AiService';
import { GitService } from '../../GitService';
import { GitHubService } from '../../GitHubService';
import { SecretScanService } from '../../SecretScanService';
import { AppSettings } from '../../settings';
import { UpdaterManager } from '../updaterManager';
import { registerAiHandlers } from './registerAiHandlers';
import { registerDiagnosticsHandlers } from './registerDiagnosticsHandlers';
import { registerDialogHandlers } from './registerDialogHandlers';
import { registerGitHandlers } from './registerGitHandlers';
import { registerGithubHandlers } from './registerGithubHandlers';
import { registerRepoSettingsHandlers } from './registerRepoSettingsHandlers';
import { registerUpdaterHandlers } from './registerUpdaterHandlers';

type SetupIpcDeps = {
  gitService: GitService;
  githubService: GitHubService;
  aiService: AiService;
  secretScanService: SecretScanService;
  updaterManager: UpdaterManager;
  readSettingsWithMigration: () => AppSettings;
  getGeminiApiKeyFromSecureStore: () => string;
  buildDiagnosticsReport: () => Promise<{
    generatedAt: string;
    appVersion: string;
    platform: string;
    activeRepo: string | null;
    report: string;
  }>;
};

export function setupIPC({
  gitService,
  githubService,
  aiService,
  secretScanService,
  updaterManager,
  readSettingsWithMigration,
  getGeminiApiKeyFromSecureStore,
  buildDiagnosticsReport,
}: SetupIpcDeps): void {
  registerDialogHandlers({ gitService });
  registerGitHandlers({ gitService, secretScanService, readSettingsWithMigration });
  registerRepoSettingsHandlers();
  registerUpdaterHandlers({ updaterManager });
  registerAiHandlers({ aiService, readSettingsWithMigration, getGeminiApiKeyFromSecureStore });
  registerGithubHandlers({ gitService, githubService, readSettingsWithMigration });
  registerDiagnosticsHandlers({ buildDiagnosticsReport });
}
