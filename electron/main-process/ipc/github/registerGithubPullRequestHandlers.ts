import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitHubService } from '../../../GitHubService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { assertGithubAuthenticated, getGithubApiErrorDetails, normalizePrState, toErrorMessage } from './githubHandlerUtils';

const actionsError = (error: unknown, fallback: string): string => {
  const message = toErrorMessage(error, fallback);
  const { status } = getGithubApiErrorDetails(error);
  return status === 403 || status === 404
    ? `${message} Check repository Actions permissions and API limits.`
    : message;
};

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

  ipcMain.handle(IpcChannel.GithubGetWorkflowRunsPage, async (_event: IpcMainInvokeEvent, params: {
    owner: string; repo: string; branch?: string; status?: string; page?: number; perPage?: number;
  }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    try {
      return { success: true, data: await githubService.getWorkflowRunsPage(params.owner, params.repo, params) };
    } catch (error) {
      return { success: false, error: actionsError(error, 'Workflow runs could not be loaded.') };
    }
  });

  ipcMain.handle(IpcChannel.GithubGetWorkflowJobsPage, async (_event: IpcMainInvokeEvent, params: {
    owner: string; repo: string; runId: number; page?: number; perPage?: number;
  }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    if (!Number.isSafeInteger(params?.runId) || params.runId <= 0) return { success: false, error: 'Invalid workflow run.' };
    try {
      return { success: true, data: await githubService.getWorkflowJobsPage(params.owner, params.repo, params.runId, params.page, params.perPage) };
    } catch (error) {
      return { success: false, error: actionsError(error, 'Workflow jobs could not be loaded.') };
    }
  });

  ipcMain.handle(IpcChannel.GithubRerunFailedJobs, async (_event: IpcMainInvokeEvent, params: { owner: string; repo: string; runId: number }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    if (!Number.isSafeInteger(params?.runId) || params.runId <= 0) return { success: false, error: 'Invalid workflow run.' };
    try {
      return { success: true, data: await githubService.rerunFailedJobs(params.owner, params.repo, params.runId) };
    } catch (error) {
      return { success: false, error: actionsError(error, 'Failed jobs could not be restarted. Check Actions write permission.') };
    }
  });

  ipcMain.handle(IpcChannel.GithubCancelWorkflowRun, async (_event: IpcMainInvokeEvent, params: { owner: string; repo: string; runId: number }) => {
    const authError = assertGithubAuthenticated(githubService);
    if (authError) return authError;
    if (!Number.isSafeInteger(params?.runId) || params.runId <= 0) return { success: false, error: 'Invalid workflow run.' };
    try {
      return { success: true, data: await githubService.cancelWorkflowRun(params.owner, params.repo, params.runId) };
    } catch (error) {
      return { success: false, error: actionsError(error, 'Workflow run could not be cancelled. Check Actions write permission.') };
    }
  });

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
        expectedHeadSha?: string;
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
          params.expectedHeadSha,
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
