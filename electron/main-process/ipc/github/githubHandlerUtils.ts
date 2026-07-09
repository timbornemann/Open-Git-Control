import type { GitHubService } from '../../../GitHubService';

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
  return error instanceof Error ? error.message : fallback;
}

export function getGithubApiErrorDetails(error: unknown): { status: number; apiMessage: string; message: string } {
  const candidate = error as GithubApiErrorLike;
  return {
    status: Number(candidate?.status),
    apiMessage: typeof candidate?.response?.data?.message === 'string' ? candidate.response.data.message : '',
    message: typeof candidate?.message === 'string' ? candidate.message : '',
  };
}

export function normalizePrState(state: string): GithubPrState {
  return state === 'closed' || state === 'all' ? state : 'open';
}

export function assertGithubAuthenticated(githubService: GitHubService): { success: false; error: string } | null {
  return githubService.isAuthenticated() ? null : { success: false, error: 'Not authenticated' };
}
