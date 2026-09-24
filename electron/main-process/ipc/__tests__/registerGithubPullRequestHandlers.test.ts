import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { GitHubService } from '../../../GitHubService';
import { registerGithubPullRequestHandlers } from '../github/registerGithubPullRequestHandlers';

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }));

describe('GitHub Actions IPC errors', () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, callback));
  });

  it('explains permissions and API limits on an Actions access error', async () => {
    const accessError = Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
    registerGithubPullRequestHandlers({ githubService: {
      isAuthenticated: () => true,
      getWorkflowRunsPage: vi.fn().mockRejectedValue(accessError),
    } as unknown as GitHubService });

    await expect(handlers.get(IpcChannel.GithubGetWorkflowRunsPage)?.({}, { owner: 'alice', repo: 'demo', page: 1 }))
      .resolves.toEqual({ success: false, error: expect.stringContaining('Check repository Actions permissions and API limits.') });
  });
});
