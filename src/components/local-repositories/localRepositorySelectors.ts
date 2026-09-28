import type { RepoMetaMap } from '@/app/state/contracts';

export const repoName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() || path;

export const selectLocalRepositories = (paths: string[], meta: RepoMetaMap, search: string, pinnedOnly: boolean): string[] => {
  const needle = search.trim().toLocaleLowerCase();
  return paths.filter((path) => {
    if (pinnedOnly && !meta[path]?.pinned) return false;
    return !needle || path.toLocaleLowerCase().includes(needle) || repoName(path).toLocaleLowerCase().includes(needle);
  });
};

export const knownHttpRemote = (origin: string | null | undefined): string | null => {
  if (!origin) return null;
  try {
    const url = new URL(origin.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? url.href : null;
  } catch {
    return null;
  }
};
