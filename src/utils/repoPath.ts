export const normalizeRepoPathKey = (repoPath: string): string => (
  String(repoPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
);
