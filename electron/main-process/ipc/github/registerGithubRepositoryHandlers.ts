import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitHubService } from '../../../GitHubService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { assertGithubAuthenticated, getGithubApiErrorDetails, toErrorMessage } from './githubHandlerUtils';

type RegisterGithubRepositoryHandlersDeps = {
  githubService: GitHubService;
};

export function registerGithubRepositoryHandlers({ githubService }: RegisterGithubRepositoryHandlersDeps): void {
  ipcMain.handle(IpcChannel.GithubGetRepos, async (_event: IpcMainInvokeEvent, params: { page?: number; perPage?: number; search?: string } = {}) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;

    try {
      const repos = await githubService.getMyRepositories(params.page, params.perPage, params.search || '');
      return { success: true, data: repos };
    } catch (error: unknown) {
      return { success: false, error: toErrorMessage(error, 'Repositories could not be loaded.') };
    }
  });

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
      return { success: false, error: toErrorMessage(error, 'Repository could not be loaded.') };
    }
  });

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
