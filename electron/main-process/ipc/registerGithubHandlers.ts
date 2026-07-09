import type { GitService } from '../../GitService';
import type { GitHubService } from '../../GitHubService';
import type { AppSettings } from '../../settings';
import { registerGithubAuthHandlers } from './github/registerGithubAuthHandlers';
import { registerGithubPullRequestHandlers } from './github/registerGithubPullRequestHandlers';
import { registerGithubReleaseHandlers } from './github/registerGithubReleaseHandlers';
import { registerGithubRepositoryHandlers } from './github/registerGithubRepositoryHandlers';

type RegisterGithubHandlersDeps = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
};

export function registerGithubHandlers({ gitService, githubService, readSettingsWithMigration }: RegisterGithubHandlersDeps): void {
  registerGithubAuthHandlers({ githubService, readSettingsWithMigration });
  registerGithubRepositoryHandlers({ githubService });
  registerGithubPullRequestHandlers({ githubService });
  registerGithubReleaseHandlers({ gitService, githubService, readSettingsWithMigration });
}
