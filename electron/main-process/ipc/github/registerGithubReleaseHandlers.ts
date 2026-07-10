import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../../../GitService';
import type { GitHubService } from '../../../GitHubService';
import type { AppSettings } from '../../../settings';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { parseReleaseCommits } from '../../parsing';
import { assertGithubAuthenticated, toErrorMessage } from './githubHandlerUtils';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';

type RegisterGithubReleaseHandlersDeps = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
};

function buildGithubRepositoryUrl(host: string, owner: string, repo: string): string {
  return `https://${host}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function normalizeReleaseRevision(value: unknown, label: string): string {
  const revision = String(value || '').trim();
  if (!revision || revision.length > 255 || revision.startsWith('-') || /[\0\r\n]/.test(revision)) {
    throw new Error(`Invalid ${label}.`);
  }
  return revision;
}

async function localCommitishExists(gitService: GitService, repoPath: string, commitish: string): Promise<boolean> {
  const trimmed = String(commitish || '').trim();
  if (!trimmed) return false;

  try {
    await gitService.runCommandAtPath(repoPath, ['rev-parse', '--verify', '--quiet', `${trimmed}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export function registerGithubReleaseHandlers({ gitService, githubService, readSettingsWithMigration }: RegisterGithubReleaseHandlersDeps): void {
  ipcMain.handle(
    IpcChannel.GithubCreateRelease,
    async (
      _event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        tagName: string;
        targetCommitish?: string;
        releaseName: string;
        body?: string;
        draft?: boolean;
        prerelease?: boolean;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      const tagName = (params?.tagName || '').trim();
      const releaseName = (params?.releaseName || '').trim();

      if (!tagName) {
        return { success: false, error: 'Tag-Name ist erforderlich.' };
      }

      if (!releaseName) {
        return { success: false, error: 'Release-Name ist erforderlich.' };
      }

      try {
        const release = await githubService.createRelease({
          owner: params.owner,
          repo: params.repo,
          tagName,
          targetCommitish: params.targetCommitish,
          releaseName,
          body: params.body,
          draft: Boolean(params.draft),
          prerelease: Boolean(params.prerelease),
        });
        return { success: true, data: release };
      } catch (error: unknown) {
        return { success: false, error: toErrorMessage(error, 'Release konnte nicht erstellt werden.') };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.GithubGetReleaseContext,
    async (
      _event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        targetCommitish?: string;
        repoPath?: string;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      const owner = String(params?.owner || '').trim();
      const repo = String(params?.repo || '').trim();
      let targetCommitish: string;
      try {
        targetCommitish = normalizeReleaseRevision(params?.targetCommitish || 'HEAD', 'release target');
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Invalid release target.' };
      }

      if (!owner || !repo) {
        return { success: false, error: 'Owner und Repository sind erforderlich.' };
      }

      let repoPath: string;
      try {
        repoPath = requireActiveRepositoryPath(params?.repoPath, gitService.getRepoPath());
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
      }

      try {
        const [existingTags, lastReleaseTag] = await Promise.all([
          githubService.listRepositoryTags(owner, repo, 300),
          githubService.getLatestReleaseTag(owner, repo),
        ]);

        const commitFormat = '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad';
        let fallbackUsed = false;
        let commitsRaw = '';

        try {
          const normalizedLastReleaseTag = lastReleaseTag ? normalizeReleaseRevision(lastReleaseTag, 'last release tag') : null;
          const canUseLastReleaseTag = normalizedLastReleaseTag ? await localCommitishExists(gitService, repoPath, normalizedLastReleaseTag) : false;

          if (normalizedLastReleaseTag && canUseLastReleaseTag) {
            commitsRaw = await gitService.runCommandAtPath(repoPath, [
              'log',
              `${normalizedLastReleaseTag}..${targetCommitish}`,
              commitFormat,
              '--date=short',
              '--max-count=400',
            ]);
          } else {
            fallbackUsed = Boolean(lastReleaseTag);
            commitsRaw = await gitService.runCommandAtPath(repoPath, ['log', targetCommitish, commitFormat, '--date=short', '--max-count=150']);
          }
        } catch {
          fallbackUsed = true;
          commitsRaw = await gitService.runCommandAtPath(repoPath, ['log', targetCommitish, commitFormat, '--date=short', '--max-count=150']);
        }

        const settings = readSettingsWithMigration();
        const githubHost = githubService.normalizeHost(settings.githubHost);
        const repositoryHtmlUrl = buildGithubRepositoryUrl(githubHost, owner, repo);
        const commitsSinceLastRelease = parseReleaseCommits(commitsRaw).map((commit) => ({
          ...commit,
          htmlUrl: commit.hash ? `${repositoryHtmlUrl}/commit/${commit.hash}` : null,
        }));

        return {
          success: true,
          data: {
            existingTags,
            lastReleaseTag: lastReleaseTag || null,
            repositoryHtmlUrl,
            commitsSinceLastRelease,
            commitsTarget: targetCommitish,
            fallbackUsed,
          },
        };
      } catch (error: unknown) {
        return { success: false, error: toErrorMessage(error, 'Release-Kontext konnte nicht geladen werden.') };
      }
    },
  );
}
