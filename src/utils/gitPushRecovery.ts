const normalizeErrorText = (value: unknown): string => String(value || '').toLowerCase();

export function isMissingUpstreamPushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('has no upstream branch') ||
    message.includes('no upstream branch') ||
    message.includes('kein upstream-branch') ||
    message.includes('keinen upstream branch') ||
    message.includes('--set-upstream') ||
    message.includes('set-upstream')
  );
}

export function isMissingRemotePushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('no configured push destination') ||
    message.includes('kein konfiguriertes push-ziel') ||
    message.includes('kein push-ziel konfiguriert') ||
    message.includes('no such remote') ||
    message.includes('kein solcher remote') ||
    message.includes('does not appear to be a git repository') ||
    message.includes('could not read from remote repository') ||
    message.includes('konnte nicht vom remote-repository lesen') ||
    message.includes('has no configured remote') ||
    message.includes('no remote configured')
  );
}

export function isPushAuthOrPermissionError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('permission denied') ||
    message.includes('zugriff verweigert') ||
    message.includes('permission to') ||
    message.includes('denied to') ||
    message.includes('repository not found') ||
    message.includes('repository wurde nicht gefunden') ||
    message.includes('authentication failed') ||
    message.includes('authentifizierung fehlgeschlagen') ||
    message.includes('invalid username or password') ||
    message.includes('invalid username or token') ||
    message.includes('could not read username') ||
    message.includes('access denied') ||
    message.includes('http 403') ||
    message.includes('403 forbidden') ||
    message.includes('requested url returned error: 403') ||
    message.includes('requested url returned error: 404') ||
    (message.includes('repository') && message.includes('not found'))
  );
}

export function shouldOfferGithubRepoRecoveryOnPushFailure(value: unknown): boolean {
  return isMissingRemotePushError(value) || isPushAuthOrPermissionError(value);
}

export function isNoLocalCommitPushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('src refspec head does not match any') ||
    (message.includes('src refspec') && message.includes('does not match any')) ||
    (message.includes('current branch') && message.includes('does not have any commits yet'))
  );
}

export function isWorkTreeRequiredError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return message.includes('must be run in a work tree') || message.includes('cannot be used without a working tree');
}

export function isNonFastForwardPushError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  const rejectedPush =
    message.includes('[rejected]') ||
    message.includes('[abgelehnt]') ||
    message.includes('failed to push some refs') ||
    message.includes('konnte einige refs nicht pushen');
  return (
    message.includes('non-fast-forward') ||
    message.includes('tip of your current branch is behind') ||
    message.includes('updates were rejected because the remote contains work') ||
    message.includes('remote enthaelt arbeit, die sie nicht lokal haben') ||
    (rejectedPush &&
      (message.includes('fetch first') || message.includes('pull first') || message.includes('zuerst fetchen') || message.includes('zuerst pullen')))
  );
}

export function isPullBlockedByLocalChangesError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('your local changes to the following files would be overwritten by merge') ||
    message.includes('your local changes to the following files would be overwritten by checkout') ||
    message.includes('lokale änderungen an den folgenden dateien würden durch merge überschrieben') ||
    message.includes('lokale aenderungen an den folgenden dateien wuerden durch merge ueberschrieben') ||
    message.includes('lokale änderungen an den folgenden dateien würden durch checkout überschrieben') ||
    message.includes('lokale aenderungen an den folgenden dateien wuerden durch checkout ueberschrieben') ||
    message.includes('please commit your changes or stash them before you merge') ||
    message.includes('please commit your changes or stash them before you rebase') ||
    message.includes('bitte committen oder stashen sie ihre änderungen, bevor sie mergen') ||
    message.includes('bitte committen oder stashen sie ihre aenderungen, bevor sie mergen') ||
    message.includes('bitte committen oder stashen sie ihre änderungen, bevor sie rebasen') ||
    message.includes('bitte committen oder stashen sie ihre aenderungen, bevor sie rebasen') ||
    message.includes('cannot pull with rebase: you have unstaged changes') ||
    message.includes('cannot rebase: you have unstaged changes') ||
    message.includes('please commit or stash them')
  );
}

export function isNotFullyMergedBranchDeleteError(value: unknown): boolean {
  const message = normalizeErrorText(value);
  return (
    message.includes('is not fully merged') ||
    message.includes('nicht vollständig zusammengeführt') ||
    message.includes('nicht vollstaendig zusammengefuehrt') ||
    message.includes('nicht vollständig gemerged') ||
    message.includes('nicht vollstaendig gemerged')
  );
}

export function compactGitError(value: unknown, maxLen = 240): string {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, Math.max(0, maxLen - 3))}...`;
}
