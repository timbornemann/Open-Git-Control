export const normalizeRepoPathKey = (repoPath: string): string => {
  const raw = String(repoPath || '').trim();
  const withForwardSlashes = raw.replace(/\\/g, '/');
  const normalized = /^\/+$/u.test(withForwardSlashes)
    ? '/'
    : /^[a-z]:\/+$/iu.test(withForwardSlashes)
      ? `${withForwardSlashes.slice(0, 2)}/`
      : withForwardSlashes.replace(/\/+$/, '');
  // Windows drive and UNC paths are case-insensitive. POSIX paths are not;
  // lowercasing them aliases distinct repositories and their cached state.
  const isWindowsPath = /^[a-z]:\//i.test(normalized) || normalized.startsWith('//');
  return isWindowsPath ? normalized.toLowerCase() : normalized;
};
