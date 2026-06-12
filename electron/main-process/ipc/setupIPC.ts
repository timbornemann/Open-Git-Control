import { AiService } from '../../AiService';
import { GitService } from '../../GitService';
import { GitHubService } from '../../GitHubService';
import { SecretScanService } from '../../SecretScanService';
import { CommitStatsService } from '../../CommitStatsService';
import { WorkingTreeService } from '../../WorkingTreeService';
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
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
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
  commitStatsService,
  workingTreeService,
  updaterManager,
  readSettingsWithMigration,
  getGeminiApiKeyFromSecureStore,
  buildDiagnosticsReport,
}: SetupIpcDeps): void {
  registerDialogHandlers({ gitService });
  registerGitHandlers({
    gitService,
    secretScanService,
    commitStatsService,
    workingTreeService,
    readSettingsWithMigration,
  });
  registerRepoSettingsHandlers();
  registerUpdaterHandlers({ updaterManager });
  registerAiHandlers({ aiService, readSettingsWithMigration, getGeminiApiKeyFromSecureStore });
  registerGithubHandlers({ gitService, githubService, readSettingsWithMigration });
  registerDiagnosticsHandlers({ buildDiagnosticsReport });
}
