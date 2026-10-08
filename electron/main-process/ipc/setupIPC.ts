import { registerReadCancellation } from '../readRequests';
import { registerBootstrapHandlers } from './registerBootstrapHandlers';
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
import { registerRepoSettingsHandlers } from './registerRepoSettingsHandlers';
import { registerProjectPlannerHandlers } from './registerProjectPlannerHandlers';
import { registerUpdaterHandlers } from './registerUpdaterHandlers';
import { registerExternalLinkHandlers } from '../externalLinks';
import { repoJobRegistry } from '../repoJobRegistry';
import { RepositoryRunConfigService } from '../RepositoryRunConfigService';
import { RepositoryRunService } from '../RepositoryRunService';
import { registerRepositoryRunHandlers } from './registerRepositoryRunHandlers';
import { readStoreData } from '../repoStore';
import { registerFeedbackHandlers } from './registerFeedbackHandlers';
import { registerHostingHandlers } from '../../hosting/registerHostingHandlers';
import { hostingService } from '../../hosting/HostingService';
import { registerRemoteTransferHandlers } from './registerRemoteTransferHandlers';
import { registerRepositoryIconHandlers } from './registerRepositoryIconHandlers';
import { registerRepositorySecretScanAllowlistHandlers } from './registerRepositorySecretScanAllowlistHandlers';

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
  getOpenAiApiKeyFromSecureStore: () => string;
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
  getOpenAiApiKeyFromSecureStore,
  buildDiagnosticsReport,
}: SetupIpcDeps): { repositoryRunService: RepositoryRunService } {
  const repositoryRunConfigService = new RepositoryRunConfigService();
  const repositoryRunService = new RepositoryRunService(repositoryRunConfigService);
  registerReadCancellation();
  registerBootstrapHandlers();
  registerDialogHandlers({ gitService });
  const pushGuard = registerGitHandlers({
    gitService,
    secretScanService,
    commitStatsService,
    workingTreeService,
    readSettingsWithMigration,
    repoJobRegistry,
  });
  registerRepoSettingsHandlers({ updaterManager, githubService });
  registerRepositoryIconHandlers();
  registerRepositorySecretScanAllowlistHandlers({ gitService, repoJobRegistry, readSettingsWithMigration });
  registerProjectPlannerHandlers({ gitService });
  registerUpdaterHandlers({ updaterManager });
  registerAiHandlers({
    aiService,
    readSettingsWithMigration,
    getGeminiApiKeyFromSecureStore,
    getOpenAiApiKeyFromSecureStore,
    getActiveRepoPath: () => gitService.getRepoPath(),
    secretScanService,
    repoJobRegistry,
  });
  registerHostingHandlers({ gitService, pushGuard });
  registerRemoteTransferHandlers({
    gitService,
    pushGuard,
    getCredentialGeneration: (id) => hostingService.generation(id),
    createCredentialEnvironment: (request) => {
      if (!request.connectionId) return Promise.resolve({ envOverrides: request.envOverrides || {}, signal: request.signal, dispose: () => {} });
      if (!request.urls.some((url) => url.startsWith('https://'))) {
        const connectionSignal = hostingService.getConnectionSignal(request.connectionId);
        return Promise.resolve({
          envOverrides: request.envOverrides || {},
          signal: request.signal ? AbortSignal.any([request.signal, connectionSignal]) : connectionSignal,
          dispose: () => {},
        });
      }
      return hostingService.createGitCredentialEnvironment({ ...request, connectionId: request.connectionId });
    },
  });
  registerDiagnosticsHandlers({ buildDiagnosticsReport });
  registerFeedbackHandlers({
    githubService,
    hasPublicGithubConnection: () => hostingService.hasGithubInfrastructureConnection(),
    createPublicGithubSession: () => hostingService.createGithubInfrastructureSession(),
  });
  registerExternalLinkHandlers();
  registerRepositoryRunHandlers({
    configService: repositoryRunConfigService,
    runService: repositoryRunService,
    readStoredRepoPaths: () => readStoreData().repos.map((repo) => repo.path),
  });
  return { repositoryRunService };
}
