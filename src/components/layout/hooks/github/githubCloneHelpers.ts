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
