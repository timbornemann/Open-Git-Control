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
    headers?: Record<string, string | number | undefined>;
  };
};

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? getGithubUserFacingErrorMessage(error, fallback) : fallback;
}

export function githubReadFailure(error: unknown, fallback: string) {
  const status = getGithubErrorStatus(error);
  const headers = (error as GithubApiErrorLike)?.response?.headers;
  const retrySeconds = Number(headers?.['retry-after']);
  const resetSeconds = Number(headers?.['x-ratelimit-reset']);
  const rateLimited =
    status === 429 || (status === 403 && (headers?.['x-ratelimit-remaining'] === '0' || /rate.?limit/i.test(getGithubRawErrorMessage(error))));
  const retryAt = rateLimited
    ? Math.max(
        Date.now() + 1000,
        Number.isFinite(retrySeconds) && retrySeconds > 0
          ? Date.now() + retrySeconds * 1000
          : Number.isFinite(resetSeconds) && resetSeconds > 0
            ? resetSeconds * 1000
            : Date.now() + 60_000,
      )
    : undefined;
  return { success: false as const, error: toErrorMessage(error, fallback), status, retryAt };
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
