import { describe, expect, it } from 'vitest';
import { describeGitFailure, explainGitNotification, notificationCopyText } from './gitFailure';

const en = (_de: string, text: string) => text;
describe('Git failure explanations', () => {
  it.each([
    ['spawn git ENOENT', 'git-missing'],
    ["'git' is not recognized as an internal or external command", 'git-missing'],
    ["git: 'lfs' is not a git command. See 'git --help'.", 'lfs-missing'],
    ['fatal: Authentication failed for https://example.test/repo.git', 'authentication'],
    ['fatal: could not read Username: terminal prompts disabled', 'authentication'],
    ['fatal: git@example.test: Permission denied (publickey).', 'authentication'],
    ['fatal: unable to access https://example.test/repo.git: The requested URL returned error: 403', 'authentication'],
    ['fatal: unable to access https://example.test/repo.git: The requested URL returned error: 502', 'connection'],
    ['refs/heads/main: [remote rejected] (Internal Server Error)', 'connection'],
    ['fatal: SSL certificate problem: certificate has expired', 'connection'],
    ['fatal: Could not resolve host: example.test', 'connection'],
    ['CONFLICT (content): Merge conflict in file.txt', 'conflict'],
    ['fatal: Author identity unknown', 'identity'],
    ['error: Your local changes would be overwritten by merge', 'local-changes'],
    ['! [rejected] main -> main (non-fast-forward)', 'diverged'],
    ["fatal: Unable to create '/repo/.git/index.lock': File exists", 'locked'],
    ['[REPO_UNAVAILABLE] fatal: not a git repository', 'repository'],
    ['Git operation was aborted.', 'cancelled'],
  ])('explains %s', (raw, kind) => {
    expect(describeGitFailure(raw, en, true)?.kind).toBe(kind);
    expect(describeGitFailure(raw, (de) => de, true)?.explanation).not.toBe(raw);
  });

  it('does not confuse local permissions or command filenames with remote authentication', () => {
    expect(describeGitFailure('fatal: unable to write /repo/file: Permission denied', en)?.kind).toBe('unknown');
    expect(describeGitFailure('Command failed: git add "Authentication failed for example.txt"\nGit Output: fatal: index.lock: File exists', en)?.kind).toBe(
      'locked',
    );
    expect(describeGitFailure('Command failed: git add "Internal Server Error.txt"\nfatal: disk full', en)?.kind).toBe('unknown');
  });
  it('leaves unrelated app/hosting errors and active progress unchanged', () => {
    const input = { msg: 'AI provider returned HTTP 503', isError: true };
    expect(explainGitNotification(input, en)).toBe(input);
    const progress = { msg: 'fatal: example progress', isError: false, kind: 'progress' as const };
    expect(explainGitNotification(progress, en)).toBe(progress);
    const prerequisite = { msg: 'Select a source or targets and a branch.', isError: true, gitContext: { repoPath: '/repo' } };
    expect(explainGitNotification(prerequisite, en)).toBe(prerequisite);
  });
  it('keeps the original diagnostic, redacts secrets, and retains partial-result context', () => {
    const input = {
      msg: 'Push partially completed.',
      isError: true,
      detail: '1 of 2 targets completed.',
      gitContext: { repoPath: '/repo' },
      technicalDetails: 'fatal: Authentication failed for https://secret-user:secret-password@example.test/repo.git?token=private-value',
    };
    const output = explainGitNotification(input, en);
    expect(output.msg).toContain('Push partially completed.');
    expect(output.msg).toContain('permissions');
    expect(output.technicalDetails).toContain('fatal: Authentication failed');
    expect(explainGitNotification(output, en)).toBe(output);
    const copied = notificationCopyText(output);
    expect(copied).toContain('1 of 2 targets completed.');
    expect(copied).toContain('[REDACTED]');
    for (const secret of ['secret-user', 'secret-password', 'private-value']) expect(copied).not.toContain(secret);
  });
  it('makes aborted reads informational and expiring', () => {
    expect(explainGitNotification({ msg: 'Git operation was aborted.', isError: true }, en)).toMatchObject({ isError: false, kind: 'info', autoHideMs: 3000 });
  });
});
