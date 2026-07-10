import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitHubService } from '../../../GitHubService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { assertGithubAuthenticated, normalizePrState, toErrorMessage } from './githubHandlerUtils';

type RegisterGithubPullRequestHandlersDeps = {
  githubService: GitHubService;
};

export function registerGithubPullRequestHandlers({ githubService }: RegisterGithubPullRequestHandlersDeps): void {
  ipcMain.handle(IpcChannel.GithubGetPrs, async (_event: IpcMainInvokeEvent, owner: string, repo: string, state: string) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;

    try {
      const prs = await githubService.getPullRequests(owner, repo, normalizePrState(state));
      return { success: true, data: prs };
    } catch (error: unknown) {
      return { success: false, error: toErrorMessage(error, 'Pull requests could not be loaded.') };
    }
  });

  ipcMain.handle(
    IpcChannel.GithubCreatePr,
    async (
      _event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        title: string;
        body: string;
        head: string;
        base: string;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      try {
        const pr = await githubService.createPullRequest(params.owner, params.repo, params.title, params.body, params.head, params.base);
        return { success: true, data: pr };
      } catch (error: unknown) {
        return { success: false, error: toErrorMessage(error, 'Pull request could not be created.') };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.GithubGetWorkflowRuns,
    async (
      _event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        branch?: string;
        headSha?: string;
        perPage?: number;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

      try {
        const runs = await githubService.getWorkflowRuns(params.owner, params.repo, {
          branch: params.branch,
          headSha: params.headSha,
          perPage: params.perPage,
        });
        return { success: true, data: runs };
      } catch (error: unknown) {
        return { success: false, error: toErrorMessage(error, 'Workflow runs could not be loaded.') };
      }
    },
  );

  ipcMain.handle(IpcChannel.GithubGetStatusChecks, async (_event: IpcMainInvokeEvent, params: { owner: string; repo: string; ref: string }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;

    try {
      const checks = await githubService.getStatusChecks(params.owner, params.repo, params.ref);
      return { success: true, data: checks };
    } catch (error: unknown) {
      return { success: false, error: toErrorMessage(error, 'Status checks could not be loaded.') };
    }
  });

  ipcMain.handle(
    IpcChannel.GithubMergePr,
    async (
      _event: IpcMainInvokeEvent,
      params: {
        owner: string;
        repo: string;
        pullNumber: number;
        mergeMethod: 'merge' | 'squash' | 'rebase';
        commitTitle?: string;
        commitMessage?: string;
      },
    ) => {
      const authError = assertGithubAuthenticated(githubService);
      if (authError) return authError;

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

        if (!result.merged) {
          return { success: false, error: result.message || 'GitHub did not merge the pull request.' };
        }

        return { success: true, data: result };
      } catch (error: unknown) {
        return { success: false, error: toErrorMessage(error, 'Pull request could not be merged.') };
      }
    },
  );
}
