import type { GitHubService } from '../GitHubService';
type GithubRemoteTarget = { owner: string; repo: string };

export function parseGithubRemoteTarget(
  remoteUrl: unknown,
  configuredHost: string,
  githubService: Pick<GitHubService, 'normalizeHost'>,
): GithubRemoteTarget | null {
  const remote = String(remoteUrl || '').trim();
  if (!remote) return null;

  let remoteHost = '';
  let remotePath = '';
  try {
    const parsed = new URL(remote);
    remoteHost = parsed.host;
    remotePath = parsed.pathname;
  } catch {
    const scpMatch = remote.match(/^(?:[^@\s]+@)?([^:\s]+):(.+)$/);
    if (!scpMatch) return null;
    remoteHost = scpMatch[1];
    remotePath = scpMatch[2];
  }

  if (!remoteHost || /[^a-z0-9.\-:]/i.test(remoteHost)) return null;
  if (githubService.normalizeHost(remoteHost) !== githubService.normalizeHost(configuredHost)) return null;
  const segments = remotePath
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .split('/');
  if (segments.length < 2 || segments.some((segment) => !segment)) return null;
  try {
    const owner = decodeURIComponent(segments[segments.length - 2]);
    const repo = decodeURIComponent(segments[segments.length - 1]);
    const invalidName = (value: string) =>
      value.includes('/') || value.includes('\\') || /\s/.test(value) || [...value].some((character) => (character.codePointAt(0) ?? 0) < 0x20);
    if ([owner, repo].some(invalidName)) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}
