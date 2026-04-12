const normalizeErrorText = (value: unknown): string => String(value || '').toLowerCase();

export function isMissingUpstreamPushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('has no upstream branch')
    || message.includes('no upstream branch')
    || message.includes('--set-upstream')
    || message.includes('set-upstream')
  );
}

export function isMissingRemotePushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('no configured push destination')
    || message.includes('no such remote')
    || message.includes('does not appear to be a git repository')
    || message.includes('could not read from remote repository')
    || message.includes('has no configured remote')
    || message.includes('no remote configured')
  );
}

export function isPushAuthOrPermissionError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('permission denied')
    || message.includes('permission to')
    || message.includes('denied to')
    || message.includes('repository not found')
    || message.includes('authentication failed')
    || message.includes('invalid username or password')
    || message.includes('invalid username or token')
    || message.includes('could not read username')
    || message.includes('access denied')
    || message.includes('http 403')
    || message.includes('403 forbidden')
    || message.includes('requested url returned error: 403')
    || message.includes('requested url returned error: 404')
    || (message.includes('repository') && message.includes('not found'))
  );
}

export function isRemoteRepositoryMissingError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('repository not found')
    || message.includes('requested url returned error: 404')
    || (message.includes('repository') && message.includes('not found'))
  );
}

export function shouldOfferGithubRepoRecoveryOnPushFailure(value: unknown): boolean {
  return isMissingRemotePushError(value) || isPushAuthOrPermissionError(value);
}

export function isNoLocalCommitPushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('src refspec head does not match any')
    || message.includes('src refspec') && message.includes('does not match any')
    || message.includes('current branch') && message.includes('does not have any commits yet')
  );
}

export function isWorkTreeRequiredError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('must be run in a work tree')
    || message.includes('cannot be used without a working tree')
  );
}

export function compactGitError(value: unknown, maxLen = 240): string {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, Math.max(0, maxLen - 3))}...`;
}
