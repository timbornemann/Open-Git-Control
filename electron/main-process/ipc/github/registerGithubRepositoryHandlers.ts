import { beginReadRequest } from '../../readRequests';
import type { ReadRequest } from '../../../../src/shared/cache/resource';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitHubService } from '../../../GitHubService';
import type { AppSettings } from '../../../settings';
import type { GitHubRepositoryDto } from '../../../../src/types/githubDtos';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { readSavedGithubTokenWithHost } from '../../secureStore';
import { readGithubCatalogCache, saveGithubCatalogCache } from '../../githubCatalogCache';
import { githubReadFailure, assertGithubAuthenticated, getGithubApiErrorDetails, toErrorMessage } from './githubHandlerUtils';

type RegisterGithubRepositoryHandlersDeps = {
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
};

export function registerGithubRepositoryHandlers({ githubService, readSettingsWithMigration }: RegisterGithubRepositoryHandlersDeps): void {
  ipcMain.handle(IpcChannel.GithubGetCatalogSnapshot, async () => {
    const configuredHost = githubService.normalizeHost(readSettingsWithMigration().githubHost);
    const snapshot = readGithubCatalogCache(configuredHost, githubService.isAuthenticated() ? githubService.getUsername() : null);
    const savedToken = readSavedGithubTokenWithHost();
    const hasBoundSession = githubService.isAuthenticated() && githubService.getHost() === configuredHost;
    const hasSavedSession = Boolean(savedToken && (savedToken.host || 'github.com') === configuredHost);
    if (!hasBoundSession && !hasSavedSession) return { success: true, data: null };
    return { success: true, data: snapshot };
  });

  ipcMain.handle(IpcChannel.GithubSaveCatalogSnapshot, async (_event: IpcMainInvokeEvent, repos: GitHubRepositoryDto[]) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    if (!Array.isArray(repos)) return { success: false, error: 'Invalid repository list.' };
    try {
      const saved = saveGithubCatalogCache(githubService.getHost(), githubService.getUsername() || '', repos);
      return { success: true, data: { savedAt: saved.savedAt } };
    } catch (error) {
      return githubReadFailure(error, 'Repository snapshot could not be saved.');
    }
  });
  ipcMain.handle(
    IpcChannel.GithubGetRepos,
    async (_event: IpcMainInvokeEvent, params: { page?: number; perPage?: number; search?: string; readRequest?: ReadRequest } = {}) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      const request = beginReadRequest(_event, params.readRequest);
      try {
        const repos = await githubService.getMyRepositories(params.page, params.perPage, params.search || '', ...(params.readRequest ? [request.signal] : []));
        return { success: true, data: repos };
      } catch (error: unknown) {
        return githubReadFailure(error, 'Repositories could not be loaded.');
      } finally {
        request.finish();
      }
    },
  );

  ipcMain.handle(IpcChannel.GithubGetRepository, async (_event: IpcMainInvokeEvent, params: { owner: string; repo: string }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;

    const owner = String(params?.owner || '').trim();
    const repo = String(params?.repo || '').trim();
    if (!owner || !repo) {
      return { success: false, error: 'Owner and repository are required.' };
    }

    try {
      const repository = await githubService.getRepository(owner, repo);
      return { success: true, data: repository };
    } catch (error: unknown) {
      return githubReadFailure(error, 'Repository could not be loaded.');
    }
  });

  ipcMain.handle(IpcChannel.GithubGetBranches, async (_event: IpcMainInvokeEvent, params: { owner: string; repo: string }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    try {
      return { success: true, data: await githubService.getBranches(params.owner, params.repo) };
    } catch (error) {
      return githubReadFailure(error, 'Branches could not be loaded.');
    }
  });

  ipcMain.handle(
    IpcChannel.GithubGetBranchesPage,
    async (event: IpcMainInvokeEvent, params: { owner: string; repo: string; page: number; readRequest?: ReadRequest }) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;
      const request = beginReadRequest(event, params?.readRequest);
      try {
        if (!params?.owner || !params.repo) throw new Error('Owner and repository are required.');
        return { success: true, data: await githubService.getBranchesPage(params.owner, params.repo, params.page, request.signal) };
      } catch (error) {
        return githubReadFailure(error, 'Branches could not be loaded.');
      } finally {
        request.finish();
      }
    },
  );

  ipcMain.handle(IpcChannel.GithubCreateRepo, async (_event: IpcMainInvokeEvent, params: { name: string; description: string; isPrivate: boolean }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;

    const name = (params?.name || '').trim();
    if (!name) {
      return { success: false, error: 'Repository name is required' };
    }

    try {
      const repo = await githubService.createRepository(name, params?.description || '', Boolean(params?.isPrivate));
      return { success: true, data: repo };
    } catch (error: unknown) {
      const message = toErrorMessage(error, 'Failed to create repository');
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    IpcChannel.GithubCreateRepoWithReadme,
    async (_event: IpcMainInvokeEvent, params: { name: string; description: string; isPrivate: boolean }) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;
      const name = String(params?.name || '').trim();
      if (!name) return { success: false, error: 'Repository name is required.' };
      try {
        return { success: true, data: await githubService.createRepositoryWithReadme(name, String(params.description || ''), Boolean(params.isPrivate)) };
      } catch (error) {
        return githubReadFailure(error, 'Repository could not be created.');
      }
    },
  );

  ipcMain.handle(
    IpcChannel.GithubForkRepo,
    async (
      _event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        name?: string;
        defaultBranchOnly?: boolean;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      const owner = String(params?.owner || '').trim();
      const repo = String(params?.repo || '').trim();
      const name = String(params?.name || '').trim();

      if (!owner || !repo) {
        return { success: false, error: 'Owner and repository are required.' };
      }

      try {
        const fork = await githubService.forkRepository(owner, repo, {
          name: name || undefined,
          defaultBranchOnly: typeof params?.defaultBranchOnly === 'boolean' ? params.defaultBranchOnly : undefined,
        });
        return { success: true, data: fork };
      } catch (error: unknown) {
        const { status, apiMessage, message } = getGithubApiErrorDetails(error);
        const fallback = message || 'Failed to fork repository.';

        if (status === 404) {
          return { success: false, error: 'Repository not found or no permission to fork it.' };
        }
        if (status === 403) {
          return { success: false, error: 'Forking forbidden for this repository or missing token scope.' };
        }
        if (status === 422 && /already exists/i.test(`${fallback} ${apiMessage}`)) {
          return { success: false, error: 'A fork already exists for this repository.' };
        }
        return { success: false, error: apiMessage || fallback };
      }
    },
  );
}
