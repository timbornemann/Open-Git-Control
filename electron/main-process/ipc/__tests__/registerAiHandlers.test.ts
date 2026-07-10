import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAiHandlers } from '../registerAiHandlers';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

describe('registerAiHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  it('restores only a running AI auto-commit state', async () => {
    const runControl: { resolve?: () => void } = {};
    const aiService = {
      testConnection: vi.fn(),
      listModels: vi.fn(),
      generateCommitMessageFromUserNotes: vi.fn(),
      runAutoCommit: vi.fn(async (_repoPath: string, _settings: any, _getKey: any, onProgress: any) => {
        onProgress({
          phase: 'grouping',
          message: 'KI gruppiert Dateien...',
          details: { mode: 'normal', processedFiles: 1 },
        });
        await new Promise<void>((resolve) => {
          runControl.resolve = resolve;
        });
        return {
          commits: [{ hash: 'abc123', subject: 'chore: test' }],
          summary: 'KI Auto-Commit abgeschlossen: 1 Commit(s) erstellt.',
          modeTransitions: ['normal'],
          processedFiles: 1,
          remainingFiles: 0,
          commitPlanStats: { totalCommits: 1 },
          warnings: [],
          diagnostics: [],
        };
      }),
    } as any;

    registerAiHandlers({
      aiService,
      readSettingsWithMigration: vi.fn(() => ({ aiAutoCommitEnabled: true })) as any,
      getGeminiApiKeyFromSecureStore: vi.fn(() => ''),
      getOpenAiApiKeyFromSecureStore: vi.fn(() => ''),
      getActiveRepoPath: () => '/tmp/repo',
    });

    const autoCommitHandler = handlers.get('git:aiAutoCommit');
    const getStateHandler = handlers.get('git:getAiAutoCommitState');
    expect(autoCommitHandler).toBeTruthy();
    expect(getStateHandler).toBeTruthy();

    const runPromise = autoCommitHandler!({ sender: { send: vi.fn() } }, { repoPath: '/tmp/repo' });
    await Promise.resolve();

    const runningState = await getStateHandler!();
    expect(runningState.success).toBe(true);
    expect(runningState.data).toEqual(
      expect.objectContaining({
        operation: 'git:aiAutoCommit',
        status: 'progress',
        message: 'KI gruppiert Dateien...',
      }),
    );

    const completeRun = runControl.resolve;
    expect(completeRun).toBeTruthy();
    if (!completeRun) {
      throw new Error('AI auto-commit resolver was not registered.');
    }
    completeRun();
    await runPromise;

    const finishedState = await getStateHandler!();
    expect(finishedState).toEqual({ success: true, data: null });
  });

  it('rejects an auto-commit request for a renderer-selected non-active repository', async () => {
    const aiService = { runAutoCommit: vi.fn() } as any;
    registerAiHandlers({
      aiService,
      readSettingsWithMigration: vi.fn(() => ({})) as any,
      getGeminiApiKeyFromSecureStore: vi.fn(() => ''),
      getOpenAiApiKeyFromSecureStore: vi.fn(() => ''),
      getActiveRepoPath: () => '/tmp/active-repo',
    });

    const result = await handlers.get('git:aiAutoCommit')!({ sender: { send: vi.fn() } }, { repoPath: '/tmp/private-other-repo' });

    expect(result).toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(aiService.runAutoCommit).not.toHaveBeenCalled();
  });
});
