import type { GitHubService } from '../../../GitHubService';
import { getGithubErrorStatus, getGithubRawErrorMessage, getGithubUserFacingErrorMessage } from '../../../github/githubErrorUtils';

export type GithubPrState = 'open' | 'closed' | 'all';

type GithubApiErrorLike = {
  status?: unknown;
  message?: unknown;
  response?: {
    data?: {
      message?: unknown;
    };
  };
};

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? getGithubUserFacingErrorMessage(error, fallback) : fallback;
}

export function getGithubApiErrorDetails(error: unknown): { status: number; apiMessage: string; message: string } {
  const candidate = error as GithubApiErrorLike;
  return {
    status: getGithubErrorStatus(error) ?? Number.NaN,
    apiMessage: typeof candidate?.response?.data?.message === 'string' ? candidate.response.data.message : '',
    message: getGithubRawErrorMessage(error),
  };
}

export function normalizePrState(state: string): GithubPrState {
  return state === 'closed' || state === 'all' ? state : 'open';
}

export function assertGithubAuthenticated(githubService: GitHubService): { success: false; error: string } | null {
  return githubService.isAuthenticated() ? null : { success: false, error: 'Not authenticated' };
}
