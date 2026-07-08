export const stripGitSuffix = (name: string): string => {
  const normalized = String(name || '').trim();
  if (!normalized) return '';
  const withoutSuffix = normalized.replace(/\.git$/i, '').trim();
  return withoutSuffix || normalized;
};

export const splitRepoPath = (repoPath: string): { parentDir: string; baseName: string } => {
  const normalized = String(repoPath || '')
    .trim()
    .replace(/[\\/]+$/, '');
  if (!normalized) {
    return { parentDir: '.', baseName: 'repository' };
  }

  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (separatorIndex < 0) {
    return { parentDir: '.', baseName: normalized };
  }

  const rawParent = normalized.slice(0, separatorIndex);
  const rawBase = normalized.slice(separatorIndex + 1) || 'repository';
  const parentDir = rawParent || (normalized.startsWith('/') ? '/' : '.');
  return {
    parentDir: /^[A-Za-z]:$/.test(parentDir) ? `${parentDir}\\` : parentDir,
    baseName: rawBase,
  };
};

export const normalizeRepoPointer = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/^file:\/\//i, '')
    .replace(/[\\]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();

export type ParsedGithubRepoReference = {
  host: string;
  owner: string;
  repo: string;
};

export const normalizeGitHost = (value: string): string => {
  const trimmed = String(value || '')
    .trim()
    .toLowerCase();
  if (!trimmed) return 'github.com';
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return withoutProtocol.startsWith('www.') ? withoutProtocol.slice(4) : withoutProtocol;
};

export const deriveRepoNameFromCloneSource = (cloneSource: string): string => {
  const normalizedSource = String(cloneSource || '').trim();
  if (!normalizedSource) return 'repository';

  const withoutProtocol = normalizedSource.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const normalizedPath = withoutProtocol
    .replace(/^git@[^:]+:/i, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const lastSegment = normalizedPath.split('/').pop() || 'repository';
  return lastSegment || 'repository';
};

export const isCloneSourceLikelyRemote = (cloneSource: string): boolean => {
  const normalizedSource = String(cloneSource || '').trim();
  if (!normalizedSource) return false;
  return /^(https?:\/\/|ssh:\/\/|git@[^:]+:)/i.test(normalizedSource);
};

export const parseGithubRepoReference = (cloneSource: string): ParsedGithubRepoReference | null => {
  const normalizedSource = String(cloneSource || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  if (!normalizedSource) return null;

  const fromHostAndPath = (hostRaw: string, pathRaw: string): ParsedGithubRepoReference | null => {
    const host = normalizeGitHost(hostRaw);
    const cleanedPath = String(pathRaw || '').replace(/^\/+/, '');
    const segments = cleanedPath.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const owner = segments[0];
    const repo = segments[1];
    if (!owner || !repo) return null;
    return { host, owner, repo };
  };

  const scpLikeMatch = normalizedSource.match(/^git@([^:]+):(.+)$/i);
  if (scpLikeMatch) {
    return fromHostAndPath(scpLikeMatch[1], scpLikeMatch[2]);
  }

  const sshLikeMatch = normalizedSource.match(/^ssh:\/\/(?:.+@)?([^/]+)\/(.+)$/i);
  if (sshLikeMatch) {
    return fromHostAndPath(sshLikeMatch[1], sshLikeMatch[2]);
  }

  try {
    const parsed = new URL(normalizedSource);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return fromHostAndPath(parsed.host, parsed.pathname);
  } catch {
    return null;
  }
};
