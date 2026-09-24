import { useEffect, useMemo, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import { toRepoIdentity } from '@/components/layout/sidebar/useGithubRepoOriginMap';

export function useLocalGithubRepos(openRepos: string[]) {
  const [identities, setIdentities] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let active = true;
    if (!gitClient.isAvailable()) return;
    void Promise.all(openRepos.map(async (repoPath) => {
      try {
        const result = await gitClient.getRepoOriginUrl(repoPath);
        return [repoPath, result.success ? toRepoIdentity(result.data || '') : null] as const;
      } catch {
        return [repoPath, null] as const;
      }
    })).then((entries) => {
      if (active) setIdentities(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [openRepos]);

  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const repoPath of openRepos) {
      const identity = identities[repoPath];
      if (!identity) continue;
      map.set(identity, [...(map.get(identity) || []), repoPath]);
    }
    return map;
  }, [identities, openRepos]);
}
