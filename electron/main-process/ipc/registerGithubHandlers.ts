import type { GitService } from '../../GitService';
import type { GitHubService } from '../../GitHubService';
import type { AppSettings } from '../../settings';
import { registerGithubAuthHandlers } from './github/registerGithubAuthHandlers';
import { registerGithubPullRequestHandlers } from './github/registerGithubPullRequestHandlers';
import { registerGithubReleaseHandlers } from './github/registerGithubReleaseHandlers';
import { registerGithubRepositoryHandlers } from './github/registerGithubRepositoryHandlers';
import type { SecretScanPushGuard } from './git/secretScanPushGuard';

type RegisterGithubHandlersDeps = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
  pushGuard?: SecretScanPushGuard;
};

export function registerGithubHandlers({ gitService, githubService, readSettingsWithMigration, pushGuard }: RegisterGithubHandlersDeps): void {
  registerGithubAuthHandlers({ githubService, readSettingsWithMigration });
  registerGithubRepositoryHandlers({ githubService, readSettingsWithMigration });
  registerGithubPullRequestHandlers({ githubService });
  registerGithubReleaseHandlers({ gitService, githubService, readSettingsWithMigration, pushGuard });
}
