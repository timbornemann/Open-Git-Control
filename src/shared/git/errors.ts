export type RepoUnavailablePayload = {
  command: string;
  error: string;
};

export const REPO_UNAVAILABLE_ERROR_PREFIX = '[REPO_UNAVAILABLE]';

export const REPO_UNAVAILABLE_ERROR_PATTERNS: readonly RegExp[] = [
  /\[REPO_UNAVAILABLE\]/i,
  /not a git repository/i,
  /no repository path set/i,
  /cannot change to/i,
  /unable to get current working directory/i,
  /no such file or directory/i,
  /the system cannot find the path specified/i,
  /\buv_cwd\b/i,
];

export const isRepoUnavailableError = (errorText: unknown): boolean => {
  const text = String(errorText || '');
  if (!text.trim()) return false;
  return REPO_UNAVAILABLE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
};

export const createRepoUnavailableErrorMessage = (details?: string): string => {
  const suffix = details ? `\nGit Output: ${details}` : '';
  return `${REPO_UNAVAILABLE_ERROR_PREFIX} Repository is no longer available (moved, deleted, or not a Git repo).${suffix}`;
};
