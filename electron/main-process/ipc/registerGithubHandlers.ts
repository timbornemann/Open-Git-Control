import { ipcMain } from 'electron';
import { GitService } from '../../GitService';
import { GitHubService } from '../../GitHubService';
import { AppSettings } from '../../settings';
import { parseReleaseCommits } from '../parsing';
import {
  clearSavedGithubTokenSecurely,
  readSavedGithubToken,
  saveGithubTokenSecurely,
} from '../secureStore';
import { runGithubCliOneClickLogin } from '../githubCliAuth';

type RegisterGithubHandlersDeps = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
};

export function registerGithubHandlers({
  gitService,
  githubService,
  readSettingsWithMigration,
}: RegisterGithubHandlersDeps): void {
  ipcMain.handle('github:auth', async (_event: any, token: string, host?: string) => {
    const settings = readSettingsWithMigration();
    const normalizedHost = githubService.normalizeHost(host || settings.githubHost);
    const success = await githubService.authenticate(token, normalizedHost);
    if (success) {
      saveGithubTokenSecurely(token);
    }
    return success;
  });

  ipcMain.handle('github:getSavedAuthStatus', async () => {
    const savedToken = readSavedGithubToken();
    const settings = readSettingsWithMigration();
    return {
      hasSavedToken: Boolean(savedToken),
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername(),
      oauthConfigured: githubService.isDeviceFlowConfigured(settings.githubOauthClientId, settings.githubHost),
    };
  });

  ipcMain.handle('github:loginWithSavedToken', async () => {
    const savedToken = readSavedGithubToken();
    if (!savedToken) {
      githubService.logout();
      return { success: false, authenticated: false, username: null };
    }

    const settings = readSettingsWithMigration();
    const success = await githubService.authenticate(savedToken, settings.githubHost);
    if (!success) {
      clearSavedGithubTokenSecurely();
      return { success: false, authenticated: false, username: null };
    }

    return {
      success: true,
      authenticated: true,
      username: githubService.getUsername(),
    };
  });

  ipcMain.handle('github:deviceStart', async () => {
    try {
      const settings = readSettingsWithMigration();
      const flow = await githubService.startDeviceFlow(settings.githubOauthClientId, settings.githubHost);
      return { success: true, data: flow };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Device Flow konnte nicht gestartet werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('github:devicePoll', async (_event: any, deviceCode: string) => {
    try {
      const normalizedDeviceCode = (deviceCode || '').trim();
      if (!normalizedDeviceCode) {
        return { success: false, error: 'device_code fehlt' };
      }

      const settings = readSettingsWithMigration();
      const result = await githubService.pollDeviceFlow(
        normalizedDeviceCode,
        settings.githubOauthClientId,
        settings.githubHost,
      );
      if (result.status === 'pending') {
        return { success: true, data: { status: 'pending', interval: result.interval || null } };
      }

      if (result.status === 'error') {
        return {
          success: true,
          data: {
            status: 'error',
            error: result.error,
            errorDescription: result.errorDescription || null,
          },
        };
      }

      const authenticated = await githubService.authenticate(result.accessToken, settings.githubHost);
      if (!authenticated) {
        return { success: false, error: 'Authentifizierung mit Device-Flow Token fehlgeschlagen.' };
      }

      saveGithubTokenSecurely(result.accessToken);
      return {
        success: true,
        data: {
          status: 'success',
          username: githubService.getUsername(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Device Flow Polling fehlgeschlagen.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('github:webLogin', async () => {
    try {
      const settings = readSettingsWithMigration();
      if (githubService.normalizeHost(settings.githubHost) !== 'github.com') {
        return {
          success: false,
          error: '1-Klick Login wird aktuell nur fuer github.com unterstuetzt. Bitte PAT verwenden.',
        };
      }

      const tokenResult = await runGithubCliOneClickLogin();

      const authenticated = await githubService.authenticate(tokenResult.accessToken, settings.githubHost);
      if (!authenticated) {
        return { success: false, error: 'Authentifizierung mit GitHub CLI Token fehlgeschlagen.' };
      }

      saveGithubTokenSecurely(tokenResult.accessToken);
      return {
        success: true,
        data: {
          username: githubService.getUsername(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'GitHub 1-Klick Login fehlgeschlagen.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('github:getRepos', async (_event: any, params: { page?: number; perPage?: number; search?: string } = {}) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const repos = await githubService.getMyRepositories(params.page, params.perPage, params.search || '');
      return { success: true, data: repos };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:createRepo', async (_event, params: { name: string; description: string; isPrivate: boolean }) => {
    if (!githubService.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const name = (params?.name || '').trim();
    if (!name) {
      return { success: false, error: 'Repository name is required' };
    }

    try {
      const repo = await githubService.createRepository(name, params?.description || '', Boolean(params?.isPrivate));
      return { success: true, data: repo };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create repository';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('github:logout', async () => {
    githubService.logout();
    clearSavedGithubTokenSecurely();
    return { success: true };
  });

  ipcMain.handle('github:checkAuthStatus', async () => {
    return {
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername(),
    };
  });

  ipcMain.handle('github:getPRs', async (_event, owner: string, repo: string, state: string) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const prs = await githubService.getPullRequests(owner, repo, state as any);
      return { success: true, data: prs };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:createPR', async (_event, params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const pr = await githubService.createPullRequest(
        params.owner,
        params.repo,
        params.title,
        params.body,
        params.head,
        params.base,
      );
      return { success: true, data: pr };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:createRelease', async (_event, params: {
    owner: string;
    repo: string;
    tagName: string;
    targetCommitish?: string;
    releaseName: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };

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
    } catch (e: any) {
      return { success: false, error: e?.message || 'Release konnte nicht erstellt werden.' };
    }
  });

  ipcMain.handle('github:getReleaseContext', async (_event, params: {
    owner: string;
    repo: string;
    targetCommitish?: string;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };

    const owner = String(params?.owner || '').trim();
    const repo = String(params?.repo || '').trim();
    const targetCommitish = String(params?.targetCommitish || '').trim() || 'HEAD';

    if (!owner || !repo) {
      return { success: false, error: 'Owner und Repository sind erforderlich.' };
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
        if (lastReleaseTag) {
          commitsRaw = await gitService.runCommand([
            'log',
            `${lastReleaseTag}..${targetCommitish}`,
            commitFormat,
            '--date=short',
            '--max-count=400',
          ]);
        } else {
          commitsRaw = await gitService.runCommand([
            'log',
            targetCommitish,
            commitFormat,
            '--date=short',
            '--max-count=150',
          ]);
        }
      } catch {
        fallbackUsed = true;
        commitsRaw = await gitService.runCommand([
          'log',
          targetCommitish,
          commitFormat,
          '--date=short',
          '--max-count=150',
        ]);
      }

      const commitsSinceLastRelease = parseReleaseCommits(commitsRaw);
      return {
        success: true,
        data: {
          existingTags,
          lastReleaseTag: lastReleaseTag || null,
          commitsSinceLastRelease,
          commitsTarget: targetCommitish,
          fallbackUsed,
        },
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Release-Kontext konnte nicht geladen werden.' };
    }
  });

  ipcMain.handle('github:getWorkflowRuns', async (_event, params: {
    owner: string;
    repo: string;
    branch?: string;
    headSha?: string;
    perPage?: number;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const runs = await githubService.getWorkflowRuns(params.owner, params.repo, {
        branch: params.branch,
        headSha: params.headSha,
        perPage: params.perPage,
      });
      return { success: true, data: runs };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:getStatusChecks', async (_event, params: { owner: string; repo: string; ref: string }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const checks = await githubService.getStatusChecks(params.owner, params.repo, params.ref);
      return { success: true, data: checks };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:mergePR', async (_event, params: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod: 'merge' | 'squash' | 'rebase';
    commitTitle?: string;
    commitMessage?: string;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const pullNumber = Number(params?.pullNumber);
      if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
        return { success: false, error: 'Invalid pull request number.' };
      }

      const result = await githubService.mergePullRequest(
        params.owner,
        params.repo,
        pullNumber,
        params.mergeMethod,
        params.commitTitle,
        params.commitMessage,
      );

      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
