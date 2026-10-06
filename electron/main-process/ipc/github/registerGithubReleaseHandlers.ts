import { parseGithubRemoteTarget } from '../../../github/releaseTargetIdentity';
import { normalizeReleaseRevision } from '../../../github/releaseTargetInspection';
import { ReleaseTargetWorkflow } from '../../../github/ReleaseTargetWorkflow';
import type { GitHubCreateReleaseParamsDto, GitHubInspectReleaseTargetParamsDto } from '../../../../src/types/githubDtos';
import type { SecretScanPushGuard } from '../git/secretScanPushGuard';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../../../GitService';
import type { GitHubService } from '../../../GitHubService';
import type { AppSettings } from '../../../settings';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { parseReleaseCommits, RELEASE_COMMIT_FORMAT } from '../../parsing';
import { assertGithubAuthenticated, toErrorMessage } from './githubHandlerUtils';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { getAuthorizedSelectedFile } from '../../fileAccessGrant';

type RegisterGithubReleaseHandlersDeps = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
  pushGuard?: SecretScanPushGuard;
};

type GithubRemoteTarget = { owner: string; repo: string };

type ReleaseAssetAuthorization = {
  owner: string;
  repo: string;
  repoPath: string;
  authenticationGeneration: number;
  expiresAt: number;
};

const RELEASE_ASSET_AUTHORIZATION_TTL_MS = 30 * 60 * 1000;
// Git tag names are refs. Keep this main-process validation local instead of
// importing renderer code, which is intentionally excluded from tsconfig.node.
// eslint-disable-next-line no-control-regex -- Git ref names reject ASCII control bytes.
const RELEASE_TAG_PATTERN = /^[^\s\x00-\x1F\x7F~^:?*[\]\\]+$/;

const isValidReleaseTagName = (tagName: string): boolean => {
  if (!RELEASE_TAG_PATTERN.test(tagName)) return false;
  return (
    tagName !== '@' &&
    !tagName.startsWith('/') &&
    !tagName.endsWith('/') &&
    !tagName.includes('//') &&
    !tagName.includes('..') &&
    !tagName.includes('@{') &&
    !tagName.endsWith('.') &&
    !tagName.split('/').some((component) => component.startsWith('.') || component.endsWith('.lock'))
  );
};

function buildGithubRepositoryUrl(host: string, owner: string, repo: string): string {
  return `https://${host}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
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

export function registerGithubReleaseHandlers({ gitService, githubService, readSettingsWithMigration, pushGuard }: RegisterGithubReleaseHandlersDeps): void {
  const targets = new ReleaseTargetWorkflow({ gitService, githubService, getHost: () => readSettingsWithMigration().githubHost, pushGuard });
  ipcMain.handle(IpcChannel.GithubInspectReleaseTarget, async (event: IpcMainInvokeEvent, params: GitHubInspectReleaseTargetParamsDto) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    try {
      if (!params?.owner?.trim() || !params.repo?.trim() || !isValidReleaseTagName(params.tagName?.trim() || '')) throw new Error('Invalid release target.');
      return { success: true, data: await targets.inspect(event, { ...params, owner: params.owner.trim(), repo: params.repo.trim() }) };
    } catch (error) {
      return { success: false, error: toErrorMessage(error, 'Release-Prüfung fehlgeschlagen.') };
    }
  });
  const releaseAuthorizationsBySender = new Map<number, Map<number, ReleaseAssetAuthorization>>();
  const cleanupRegisteredSenders = new Set<number>();

  const rememberReleaseAuthorization = (event: IpcMainInvokeEvent, releaseId: unknown, target: GithubRemoteTarget, repoPath: string): void => {
    const senderId = event.sender?.id;
    const normalizedReleaseId = Number(releaseId);
    if (!Number.isInteger(senderId) || senderId <= 0 || !Number.isInteger(normalizedReleaseId) || normalizedReleaseId <= 0) return;

    const now = Date.now();
    const authorizations = releaseAuthorizationsBySender.get(senderId) || new Map<number, ReleaseAssetAuthorization>();
    for (const [id, authorization] of authorizations) {
      if (authorization.expiresAt <= now) authorizations.delete(id);
    }
    authorizations.set(normalizedReleaseId, {
      owner: target.owner,
      repo: target.repo,
      repoPath,
      authenticationGeneration: githubService.getAuthenticationGeneration?.() ?? 0,
      expiresAt: now + RELEASE_ASSET_AUTHORIZATION_TTL_MS,
    });
    releaseAuthorizationsBySender.set(senderId, authorizations);

    if (!cleanupRegisteredSenders.has(senderId) && typeof event.sender.once === 'function') {
      cleanupRegisteredSenders.add(senderId);
      event.sender.once('destroyed', () => {
        releaseAuthorizationsBySender.delete(senderId);
        cleanupRegisteredSenders.delete(senderId);
      });
    }
  };

  const getReleaseAuthorization = (senderId: number, releaseId: number): ReleaseAssetAuthorization | null => {
    const authorizations = releaseAuthorizationsBySender.get(senderId);
    const authorization = authorizations?.get(releaseId);
    if (!authorization) return null;
    if (authorization.expiresAt <= Date.now()) {
      authorizations?.delete(releaseId);
      if (authorizations?.size === 0) releaseAuthorizationsBySender.delete(senderId);
      return null;
    }
    return authorization;
  };

  ipcMain.handle(IpcChannel.GithubCreateRelease, async (event: IpcMainInvokeEvent, params: GitHubCreateReleaseParamsDto) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;

    const tagName = (params?.tagName || '').trim();
    const releaseName = (params?.releaseName || '').trim();

    if (!tagName) {
      return { success: false, error: 'Tag-Name ist erforderlich.' };
    }

    if (!isValidReleaseTagName(tagName)) {
      return { success: false, error: 'Invalid tag name.' };
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
      authorizedRepoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GithubCreateRelease);
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
    }

    try {
      const originUrl = await gitService.getRepoOriginUrl(authorizedRepoPath);
      // Origin resolution is asynchronous. Re-authorize immediately before
      // the irreversible GitHub write so a repository switch during that
      // read cannot validate a stale release request.
      requireActiveRepositoryPath(authorizedRepoPath, gitService.getRepoPath(), IpcChannel.GithubCreateRelease);
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
      requireActiveRepositoryPath(authorizedRepoPath, gitService.getRepoPath(), IpcChannel.GithubCreateRelease);
      const currentAuthError = assertGithubAuthenticated(githubService);
      if (currentAuthError) return currentAuthError;

      const release = await targets.create(event, {
        ...params,
        owner: originTarget.owner,
        repo: originTarget.repo,
        tagName,
        targetCommitish: params.targetCommitish,
        releaseName,
        body: params.body,
        draft: Boolean(params.draft),
        prerelease: Boolean(params.prerelease),
      });
      rememberReleaseAuthorization(event, release.id, originTarget, authorizedRepoPath);
      return { success: true, data: release };
    } catch (error: unknown) {
      return { success: false, error: toErrorMessage(error, 'Release konnte nicht erstellt werden.') };
    }
  });

  ipcMain.handle(
    IpcChannel.GithubUploadReleaseAsset,
    async (
      event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        repoPath?: string;
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

      const authorization = getReleaseAuthorization(event.sender.id, releaseId);
      if (
        !authorization ||
        authorization.owner.toLowerCase() !== owner.toLowerCase() ||
        authorization.repo.toLowerCase() !== repo.toLowerCase() ||
        authorization.authenticationGeneration !== (githubService.getAuthenticationGeneration?.() ?? 0)
      ) {
        return { success: false, error: 'RELEASE_ASSET_TARGET_NOT_AUTHORIZED' };
      }
      try {
        requireActiveRepositoryPath(authorization.repoPath, gitService.getRepoPath(), IpcChannel.GithubUploadReleaseAsset);
        requireActiveRepositoryPath(params.repoPath, authorization.repoPath, IpcChannel.GithubUploadReleaseAsset);
      } catch {
        return { success: false, error: 'RELEASE_ASSET_REPOSITORY_NOT_ACTIVE' };
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
        repoPath = requireActiveRepositoryPath(params?.repoPath, gitService.getRepoPath(), IpcChannel.GithubGetReleaseContext);
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
      }

      try {
        const [existingTags, lastReleaseTag] = await Promise.all([
          githubService.listRepositoryTags(owner, repo, 300),
          githubService.getLatestReleaseTag(owner, repo),
        ]);

        const commitFormat = RELEASE_COMMIT_FORMAT;
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
