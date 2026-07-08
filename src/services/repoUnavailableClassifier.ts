export type RepoUnavailablePayload = {
  command: string;
  error: string;
};

const REPO_UNAVAILABLE_ERROR_PATTERNS: RegExp[] = [
  /\[REPO_UNAVAILABLE\]/i,
  /not a git repository/i,
  /no repository path set/i,
  /cannot change to/i,
  /no such file or directory/i,
  /the system cannot find the path specified/i,
  /\buv_cwd\b/i,
];

export const isRepoUnavailableError = (errorText: unknown): boolean => {
  const text = String(errorText || '');
  if (!text.trim()) return false;
  return REPO_UNAVAILABLE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
};
