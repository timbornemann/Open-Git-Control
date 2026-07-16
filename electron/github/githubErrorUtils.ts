type GithubErrorLike = {
  status?: unknown;
  message?: unknown;
  response?: {
    status?: unknown;
    data?: unknown;
  };
};

const MAX_USER_FACING_ERROR_LENGTH = 500;

export function getGithubErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as GithubErrorLike;
  const status = Number(candidate.status ?? candidate.response?.status);
  return Number.isInteger(status) ? status : null;
}

export function getGithubRawErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (!error || typeof error !== 'object') return '';
  const message = (error as GithubErrorLike).message;
  return typeof message === 'string' ? message.trim() : '';
}

function getGithubResponseMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const data = (error as GithubErrorLike).response?.data;
  if (!data || typeof data !== 'object') return '';
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' ? message.trim() : '';
}

function isHtmlErrorPage(value: string): boolean {
  return /<!doctype\s+html|<html(?:\s|>)|<\/html>/i.test(value);
}

function messageForStatus(status: number, fallback: string): string {
  if (status === 401) return 'GitHub authentication failed (HTTP 401). Please sign in again.';
  if (status === 403) return 'GitHub denied access (HTTP 403). Check your token permissions.';
  if (status === 404) return 'GitHub resource not found (HTTP 404). Check repository access and the configured host.';
  if (status === 429) return 'GitHub rate limit reached (HTTP 429). Please try again later.';
  if (status === 502 || status === 503 || status === 504) return `GitHub is temporarily unavailable (HTTP ${status}). Please try again shortly.`;
  return `${fallback} (GitHub returned HTTP ${status}.)`;
}

export function getGithubUserFacingErrorMessage(error: unknown, fallback: string): string {
  const status = getGithubErrorStatus(error);
  const responseMessage = getGithubResponseMessage(error);
  const message = responseMessage || getGithubRawErrorMessage(error);

  if (!message) return status === null ? fallback : messageForStatus(status, fallback);
  if (isHtmlErrorPage(message) || message.length > MAX_USER_FACING_ERROR_LENGTH) {
    return status === null ? 'GitHub returned an unexpected error page. Please try again shortly.' : messageForStatus(status, fallback);
  }

  return message;
}
