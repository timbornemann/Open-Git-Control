import type { AiService } from '../../AiService';
import type { GitService } from '../../GitService';
import type { GitHubService } from '../../GitHubService';
import type { SecretScanService } from '../../SecretScanService';
import type { CommitStatsService } from '../../CommitStatsService';
import type { WorkingTreeService } from '../../WorkingTreeService';
import type { AppSettings } from '../../settings';
import type { UpdaterManager } from '../updaterManager';
import { registerAiHandlers } from './registerAiHandlers';
import { registerDiagnosticsHandlers } from './registerDiagnosticsHandlers';
import { registerDialogHandlers } from './registerDialogHandlers';
import { registerGitHandlers } from './registerGitHandlers';
import { registerGithubHandlers } from './registerGithubHandlers';
import { registerRepoSettingsHandlers } from './registerRepoSettingsHandlers';
import { registerProjectPlannerHandlers } from './registerProjectPlannerHandlers';
import { registerUpdaterHandlers } from './registerUpdaterHandlers';
import { registerExternalLinkHandlers } from '../externalLinks';
import { repoJobRegistry } from '../repoJobRegistry';

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
    repoJobRegistry,
  });
  registerRepoSettingsHandlers({ updaterManager, githubService });
  registerProjectPlannerHandlers({ gitService });
  registerUpdaterHandlers({ updaterManager });
  registerAiHandlers({
    aiService,
    readSettingsWithMigration,
    getGeminiApiKeyFromSecureStore,
    getActiveRepoPath: () => gitService.getRepoPath(),
    repoJobRegistry,
  });
  registerGithubHandlers({ gitService, githubService, readSettingsWithMigration });
  registerDiagnosticsHandlers({ buildDiagnosticsReport });
  registerExternalLinkHandlers();
}
