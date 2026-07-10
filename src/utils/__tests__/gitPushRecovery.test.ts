import { describe, expect, it } from 'vitest';
import {
  compactGitError,
  isMissingRemotePushError,
  isMissingUpstreamPushError,
  isNonFastForwardPushError,
  isNoLocalCommitPushError,
  isPullBlockedByLocalChangesError,
  isPushAuthOrPermissionError,
  isNotFullyMergedBranchDeleteError,
  isWorkTreeRequiredError,
  shouldOfferGithubRepoRecoveryOnPushFailure,
} from '@/utils/gitPushRecovery';

describe('gitPushRecovery', () => {
  it('detects missing upstream errors', () => {
    expect(isMissingUpstreamPushError('fatal: The current branch test has no upstream branch.')).toBe(true);
    expect(isMissingUpstreamPushError('Use --set-upstream to track.')).toBe(true);
    expect(isMissingUpstreamPushError('fatal: repository not found')).toBe(false);
  });

  it('detects missing remote/push destination errors', () => {
    expect(isMissingRemotePushError('fatal: No configured push destination.')).toBe(true);
    expect(isMissingRemotePushError("fatal: No such remote 'origin'")).toBe(true);
    expect(isMissingRemotePushError('fatal: origin does not appear to be a git repository')).toBe(true);
    expect(isMissingRemotePushError('fatal: Kein konfiguriertes Push-Ziel.')).toBe(true);
    expect(isMissingRemotePushError('fatal: Authentication failed')).toBe(false);
  });

  it('detects auth/permission errors', () => {
    expect(isPushAuthOrPermissionError('remote: Permission to owner/repo.git denied to user.')).toBe(true);
    expect(isPushAuthOrPermissionError('fatal: Authentication failed for https://github.com/owner/repo.git')).toBe(true);
    expect(isPushAuthOrPermissionError('remote: Repository not found.')).toBe(true);
    expect(isPushAuthOrPermissionError("fatal: unable to access 'https://github.com/owner/repo.git/': The requested URL returned error: 404")).toBe(true);
    expect(isPushAuthOrPermissionError('fatal: No configured push destination.')).toBe(false);
  });

  it('offers recovery for remote setup and auth failures', () => {
    expect(shouldOfferGithubRepoRecoveryOnPushFailure('No configured push destination')).toBe(true);
    expect(shouldOfferGithubRepoRecoveryOnPushFailure('Permission denied')).toBe(true);
    expect(shouldOfferGithubRepoRecoveryOnPushFailure('has no upstream branch')).toBe(false);
  });

  it('detects missing local commit push errors', () => {
    expect(isNoLocalCommitPushError('error: src refspec HEAD does not match any')).toBe(true);
    expect(isNoLocalCommitPushError('fatal: current branch main does not have any commits yet')).toBe(true);
    expect(isNoLocalCommitPushError('fatal: No configured push destination.')).toBe(false);
  });

  it('detects non-fast-forward push rejections', () => {
    expect(isNonFastForwardPushError('! [rejected] main -> main (fetch first)')).toBe(true);
    expect(isNonFastForwardPushError('Updates were rejected because the tip of your current branch is behind its remote counterpart.')).toBe(true);
    expect(isNonFastForwardPushError('! [abgelehnt] main -> main (zuerst fetchen)')).toBe(true);
    expect(isNonFastForwardPushError('Everything up-to-date')).toBe(false);
  });

  it('detects pull failures caused by local uncommitted changes', () => {
    expect(isPullBlockedByLocalChangesError('error: Your local changes to the following files would be overwritten by merge:')).toBe(true);
    expect(isPullBlockedByLocalChangesError('Please commit your changes or stash them before you merge.')).toBe(true);
    expect(isPullBlockedByLocalChangesError('Fehler: Lokale Aenderungen an den folgenden Dateien wuerden durch Merge ueberschrieben')).toBe(true);
    expect(isPullBlockedByLocalChangesError('fatal: refusing to merge unrelated histories')).toBe(false);
  });

  it('detects work tree required errors', () => {
    expect(isWorkTreeRequiredError('fatal: this operation must be run in a work tree')).toBe(true);
    expect(isWorkTreeRequiredError('fatal: git-submodule cannot be used without a working tree.')).toBe(true);
    expect(isWorkTreeRequiredError('fatal: Authentication failed')).toBe(false);
  });

  it('detects not-fully-merged branch delete errors', () => {
    expect(isNotFullyMergedBranchDeleteError("error: The branch 'feature' is not fully merged.")).toBe(true);
    expect(isNotFullyMergedBranchDeleteError("error: Der Branch 'feature' ist nicht vollständig zusammengeführt.")).toBe(true);
    expect(isNotFullyMergedBranchDeleteError("error: Cannot delete branch 'main' checked out at")).toBe(false);
  });

  it('compacts and truncates verbose errors', () => {
    expect(compactGitError('  fatal:\n  some   error  ')).toBe('fatal: some error');
    const truncated = compactGitError('x'.repeat(300), 20);
    expect(truncated.length).toBe(20);
    expect(truncated.endsWith('...')).toBe(true);
  });
});
