import { afterEach, expect, it, vi } from 'vitest';
import { commitMessageEdits } from '@/services/commitMessageEdits';
import { refreshRewrittenHistory } from '@/data/commitMessageEdit';

vi.mock('@/data/commitMessageEdit', () => ({ refreshRewrittenHistory: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const request = {
  repoPath: 'C:/repo',
  commitHash: 'a'.repeat(40),
  expectedHead: 'b'.repeat(40),
  expectedBranch: 'main',
  title: 'New message',
  description: '',
};

it('forwards inspection, recovery, cancellation and progress to the Git IPC domain', async () => {
  const unsubscribe = vi.fn();
  const git = {
    inspectCommitMessageEdit: vi.fn().mockResolvedValue({ success: true }),
    getCommitMessageEditBackups: vi.fn().mockResolvedValue({ success: true, data: [] }),
    cancelCommitMessageEdit: vi.fn().mockResolvedValue(true),
    onJobEvent: vi.fn().mockReturnValue(unsubscribe),
  };
  vi.stubGlobal('window', { electronAPI: { git } });

  await commitMessageEdits.inspectCommitMessageEdit(request);
  await commitMessageEdits.getCommitMessageEditBackups(request.repoPath);
  await expect(commitMessageEdits.cancelCommitMessageEdit('operation')).resolves.toBe(true);
  const listener = vi.fn();
  expect(commitMessageEdits.onCommitMessageEditProgress(listener)).toBe(unsubscribe);
  expect(git.inspectCommitMessageEdit).toHaveBeenCalledWith(request);
  expect(git.getCommitMessageEditBackups).toHaveBeenCalledWith(request.repoPath);
  expect(git.cancelCommitMessageEdit).toHaveBeenCalledWith('operation');
  expect(git.onJobEvent).toHaveBeenCalledWith(listener);
});

it.each([
  { success: true, data: { changed: true } },
  { success: true, data: { changed: false } },
  { success: false, error: 'Rejected' },
])('refreshes rewritten history only after an actual successful edit: %j', async (result) => {
  const rewordCommitMessage = vi.fn().mockResolvedValue(result);
  vi.stubGlobal('window', { electronAPI: { git: { rewordCommitMessage } } });

  await expect(commitMessageEdits.rewordCommitMessage(request)).resolves.toBe(result);

  expect(rewordCommitMessage).toHaveBeenCalledWith(request);
  if (result.success && result.data?.changed) expect(refreshRewrittenHistory).toHaveBeenCalledWith(request.repoPath);
  else expect(refreshRewrittenHistory).not.toHaveBeenCalled();
});
