import { useEffect, useMemo, useState } from 'react';
import { gitClient } from '@/services/gitClient';

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
  const [repoOriginByPath, setRepoOriginByPath] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let active = true;

    const loadOrigins = async () => {
      if (!gitClient.isAvailable() || openRepos.length === 0) {
        if (active) setRepoOriginByPath({});
        return;
      }

      const entries = await Promise.all(
        openRepos.map(async (repoPath) => {
          try {
            const result = await gitClient.getRepoOriginUrl(repoPath);
            if (!result.success) return [repoPath, null] as const;
            return [repoPath, toRepoIdentity(result.data || '')] as const;
          } catch {
            return [repoPath, null] as const;
          }
        }),
      );

      if (!active) return;
      const next: Record<string, string | null> = {};
      for (const [repoPath, identity] of entries) {
        next[repoPath] = identity;
      }
      setRepoOriginByPath(next);
    };

    void loadOrigins();
    return () => {
      active = false;
    };
  }, [openRepos]);

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const repoPath of openRepos) {
      const identity = repoOriginByPath[repoPath];
      if (identity) map.set(identity, repoPath);
    }
    return map;
  }, [openRepos, repoOriginByPath]);
};
