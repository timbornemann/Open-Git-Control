import { FolderGit2 } from 'lucide-react';
import { RepositoryIcon } from '@/components/repository-icon/RepositoryIcon';
import { useI18n } from '@/i18n';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export const isActiveHostingClone = (path: string, activeRepo: string | null) =>
  activeRepo !== null && normalizeRepoPathKey(path) === normalizeRepoPathKey(activeRepo);

export function hostingLocalRepositoryIdentity(paths: string[], activeRepo: string | null) {
  const path = paths.find((candidate) => isActiveHostingClone(candidate, activeRepo)) ?? paths[0] ?? null;
  return { path, isActive: path !== null && isActiveHostingClone(path, activeRepo) };
}

export function HostingRepositoryIcon({ path, name, size = 26 }: { path: string | null; name: string; size?: number }) {
  return (
    <span className="hosting-signet" style={{ width: size, height: size }} aria-hidden="true">
      {path ? (
        <RepositoryIcon key={path} repoPath={path} name={path.split(/[\\/]/).filter(Boolean).pop() || name} size={size} />
      ) : (
        <FolderGit2 size={Math.max(12, size - 6)} />
      )}
    </span>
  );
}

export function HostingActiveRepositoryMark() {
  const { tr } = useI18n();
  return <small className="hosting-repository-active">{tr('AKTIV', 'ACTIVE')}</small>;
}
