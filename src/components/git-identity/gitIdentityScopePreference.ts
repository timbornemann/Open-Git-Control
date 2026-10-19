import type { GitIdentityScope } from '@/shared/ipc/gitIdentity';

const key = 'ogc:git-identity:settings-scope';
export function readIdentitySettingsScope(repoPath: string | null): GitIdentityScope {
  if (!repoPath) return 'global';
  try {
    const value = localStorage.getItem(key);
    if (value === 'global' || value === 'repository') return value;
  } catch {
    /* The optional view preference does not affect Git configuration. */
  }
  return 'repository';
}
export function rememberIdentitySettingsScope(scope: GitIdentityScope) {
  try {
    localStorage.setItem(key, scope);
  } catch {
    /* Git saving remains available without local storage. */
  }
}
