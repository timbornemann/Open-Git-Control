import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../../../GitService';
import type { GitHubService } from '../../../GitHubService';
import type { AppSettings } from '../../../settings';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { parseReleaseCommits } from '../../parsing';
import { assertGithubAuthenticated, toErrorMessage } from './githubHandlerUtils';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { getAuthorizedSelectedFile } from '../../fileAccessGrant';

type RegisterGithubReleaseHandlersDeps = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
};

type GithubRemoteTarget = { owner: string; repo: string };

function parseGithubRemoteTarget(remoteUrl: unknown, configuredHost: string, githubService: Pick<GitHubService, 'normalizeHost'>): GithubRemoteTarget | null {
  const remote = String(remoteUrl || '').trim();
  if (!remote) return null;

  let remoteHost = '';
  let remotePath = '';
  try {
    const parsed = new URL(remote);
    remoteHost = parsed.host;
    remotePath = parsed.pathname;
  } catch {
    const scpMatch = remote.match(/^(?:[^@\s]+@)?([^:\s]+):(.+)$/);
    if (!scpMatch) return null;
    remoteHost = scpMatch[1];
    remotePath = scpMatch[2];
  }

  if (!remoteHost || /[^a-z0-9.\-:]/i.test(remoteHost)) return null;
  if (githubService.normalizeHost(remoteHost) !== githubService.normalizeHost(configuredHost)) return null;
  const segments = remotePath
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .split('/');
  if (segments.length < 2 || segments.some((segment) => !segment)) return null;
  try {
    const owner = decodeURIComponent(segments[segments.length - 2]);
    const repo = decodeURIComponent(segments[segments.length - 1]);
    const invalidName = (value: string) =>
      value.includes('/') || value.includes('\\') || /\s/.test(value) || [...value].some((character) => (character.codePointAt(0) ?? 0) < 0x20);
    if ([owner, repo].some(invalidName)) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

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
        repoPath?: string;
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

      const requestedRepoPath = String(params?.repoPath || '').trim();
      if (!requestedRepoPath) {
        return { success: false, error: 'Repository path is required.' };
      }
      let authorizedRepoPath: string;
      try {
        authorizedRepoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
      }

      try {
        const originUrl = await gitService.getRepoOriginUrl(authorizedRepoPath);
        // Origin resolution is asynchronous. Re-authorize immediately before
        // the irreversible GitHub write so a repository switch during that
        // read cannot validate a stale release request.
        requireActiveRepositoryPath(authorizedRepoPath, gitService.getRepoPath());
        const settings = readSettingsWithMigration();
        const originTarget = parseGithubRemoteTarget(originUrl, settings.githubHost, githubService);
        if (!originTarget) {
          return { success: false, error: 'The active repository has no matching GitHub origin.' };
        }
        if (
          originTarget.owner.toLowerCase() !==
            String(params.owner || '')
              .trim()
              .toLowerCase() ||
          originTarget.repo.toLowerCase() !==
            String(params.repo || '')
              .trim()
              .toLowerCase()
        ) {
          return { success: false, error: 'Release target does not match the active repository origin.' };
        }
        const currentAuthError = assertGithubAuthenticated(githubService);
        if (currentAuthError) return currentAuthError;

        const release = await githubService.createRelease({
          owner: originTarget.owner,
          repo: originTarget.repo,
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
    IpcChannel.GithubUploadReleaseAsset,
    async (
      event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        releaseId: number;
        filePath: string;
        name?: string;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      const owner = String(params?.owner || '').trim();
      const repo = String(params?.repo || '').trim();
      const filePath = String(params?.filePath || '').trim();
      const releaseId = Number(params?.releaseId);
      const name = String(params?.name || '').trim();

      if (!owner || !repo) {
        return { success: false, error: 'RELEASE_ASSET_OWNER_REPOSITORY_REQUIRED' };
      }
      if (!Number.isFinite(releaseId) || releaseId <= 0) {
        return { success: false, error: 'RELEASE_ASSET_RELEASE_ID_REQUIRED' };
      }
      if (!filePath) {
        return { success: false, error: 'RELEASE_ASSET_FILE_PATH_REQUIRED' };
      }

      const authorizedFilePath = getAuthorizedSelectedFile(event.sender.id, filePath);
      if (!authorizedFilePath) {
        return { success: false, error: 'RELEASE_ASSET_FILE_NOT_AUTHORIZED' };
      }

      try {
        const asset = await githubService.uploadReleaseAsset({
          owner,
          repo,
          releaseId,
          filePath: authorizedFilePath,
          ...(name ? { name } : {}),
        });
        return { success: true, data: asset };
      } catch (error: unknown) {
        return { success: false, error: toErrorMessage(error, 'RELEASE_ASSET_UPLOAD_FAILED') };
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
