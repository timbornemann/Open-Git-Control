import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../../../GitService';
import { IpcChannel } from '../../../../../src/types/ipcContract';

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
}));

import { detectSequencerOperationInGitDir, registerGitOperationStateHandler } from '../registerGitOperationStateHandler';

beforeEach(() => {
  handleMock.mockReset();
});

describe('detectSequencerOperationInGitDir', () => {
  const gitDir = path.resolve('C:/repo/.git');

  const detect = (...relativePaths: string[]) => {
    const existing = new Set(relativePaths.map((relativePath) => path.join(gitDir, relativePath)));
    return detectSequencerOperationInGitDir(gitDir, (candidatePath) => existing.has(candidatePath));
  };

  it('detects all supported Git state markers and returns null for an idle repository', () => {
    expect(detect('MERGE_HEAD')).toBe('merge');
    expect(detect('CHERRY_PICK_HEAD')).toBe('cherry-pick');
    expect(detect('rebase-merge')).toBe('rebase');
    expect(detect('rebase-apply')).toBe('rebase');
    expect(detect()).toBeNull();
  });

  it('gives dedicated rebase state precedence over generic sequencer markers', () => {
    expect(detect('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge')).toBe('rebase');
  });
});

describe('registerGitOperationStateHandler', () => {
  it('pins state inspection to the active repository and rejects a different requested repository', async () => {
    const gitService = { getRepoPath: vi.fn().mockReturnValue('C:/repo') } as unknown as GitService;
    const readOperation = vi.fn().mockResolvedValue('cherry-pick');
    registerGitOperationStateHandler({ gitService, readOperation });
    const handler = handleMock.mock.calls.find((call) => call[0] === IpcChannel.GitSequencerState)?.[1];
    expect(handler).toBeTypeOf('function');

    await expect(handler({}, 'C:/repo')).resolves.toEqual({ success: true, data: { operation: 'cherry-pick' } });
    expect(readOperation).toHaveBeenCalledWith(gitService, 'C:/repo');

    await expect(handler({}, 'C:/other')).resolves.toEqual({
      success: false,
      error:
        'Requested repository is not the active repository while handling "git:sequencerState". Requested repository: "C:/other". Active repository: "C:/repo".',
    });
    expect(readOperation).toHaveBeenCalledTimes(1);
  });
});
