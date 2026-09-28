import { useMemo } from 'react';
import { useRepoOrigins } from '@/hooks/useRepoOrigins';

export const toRepoIdentity = (remoteUrl: string): string | null => {
  const trimmed = (remoteUrl || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/i);
  if (sshMatch) {
    return `${sshMatch[1].toLowerCase()}/${sshMatch[2].replace(/^\/+/, '').toLowerCase()}`;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.host.toLowerCase()}/${parsed.pathname.replace(/^\/+/, '').toLowerCase()}`;
  } catch {
    return null;
  }
};

export const useGithubRepoOriginMap = (openRepos: string[]): Map<string, string> => {
  const origins = useRepoOrigins(openRepos);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const repo of openRepos) {
      const identity = toRepoIdentity(origins[repo] || '');
      if (identity) map.set(identity, repo);
    }
    return map;
  }, [openRepos, origins]);
};
