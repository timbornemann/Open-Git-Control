/** Conservative identity for local repositories that share a Git endpoint. */
export const toRepositoryRemoteIdentity = (remoteUrl: string): string | null => {
  const source = remoteUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  if (!source) return null;
  const scp = source.match(/^[^/@\s]+@([^:\s]+):(.+)$/);
  if (scp) return `${scp[1].toLowerCase()}/${scp[2].replace(/^\/+/, '')}`;
  try {
    const url = new URL(source);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    return `${url.host.toLowerCase()}/${url.pathname.replace(/^\/+/, '')}`;
  } catch {
    return null;
  }
};
