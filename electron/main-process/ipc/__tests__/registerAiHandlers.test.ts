import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAiHandlers } from '../registerAiHandlers';

const { handleMock, policy } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  policy: { text: '', version: 'v1' },
}));

vi.mock('../../repositorySecretScanAllowlist', () => ({
  repositorySecretScanAllowlistService: {
    prepare: async () => ({ ...policy }),
    assertVersion: (_repoPath: string, version: string) => {
      if (version !== policy.version) throw new Error('Secret-scan allowlist changed.');
    },
  },
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
    policy.text = 'path:docs/example.env';
    policy.version = 'v1';
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
      runAutoCommitWithOptions: vi.fn(async (_repoPath: string, _settings: any, _getKey: any, onProgress: any) => {
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
      secretScanService: { scanStagedDiffs: vi.fn() } as any,
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
    const aiService = { runAutoCommitWithOptions: vi.fn() } as any;
    registerAiHandlers({
      aiService,
      readSettingsWithMigration: vi.fn(() => ({})) as any,
      getGeminiApiKeyFromSecureStore: vi.fn(() => ''),
      getOpenAiApiKeyFromSecureStore: vi.fn(() => ''),
      getActiveRepoPath: () => '/tmp/active-repo',
      secretScanService: { scanStagedDiffs: vi.fn() } as any,
    });

    const result = await handlers.get('git:aiAutoCommit')!({ sender: { send: vi.fn() } }, { repoPath: '/tmp/private-other-repo' });

    expect(result).toEqual({
      success: false,
      error:
        'Requested repository is not the active repository while handling "git:aiAutoCommit". Requested repository: "/tmp/private-other-repo". Active repository: "/tmp/active-repo".',
    });
    expect(aiService.runAutoCommitWithOptions).not.toHaveBeenCalled();
  });

  it.each(['scan', 'publication'])('keeps AI commits bound to the repository policy during %s', async (phase) => {
    const publish = vi.fn();
    const scan = vi.fn(async (input) => {
      expect(input).toMatchObject({ repoPath: '/tmp/repo', allowlistText: policy.text, envOverrides: { GIT_INDEX_FILE: '/private-index' } });
      if (phase === 'scan') policy.version = 'v2';
      return { findings: [], notes: [], historyScanIncomplete: false };
    });
    const aiService = {
      runAutoCommitWithOptions: vi.fn(async (_repo: string, _settings: any, _key: any, _progress: any, _cancel: any, _openAi: any, options: any) => {
        await options.beforeCommit('/private-index', 'base-tree');
        policy.version = 'v2';
        options.verifySecretScanContext();
        publish();
      }),
    } as any;
    registerAiHandlers({
      aiService,
      readSettingsWithMigration: () => ({ secretScanBeforeCommitEnabled: true, secretScanStrictness: 'balanced' }) as any,
      getGeminiApiKeyFromSecureStore: () => '',
      getOpenAiApiKeyFromSecureStore: () => '',
      getActiveRepoPath: () => '/tmp/repo',
      secretScanService: { scanStagedDiffs: scan } as any,
    });
    const result = await handlers.get('git:aiAutoCommit')!({ sender: { send: vi.fn() } }, { repoPath: '/tmp/repo' });
    expect(result).toEqual({ success: false, error: 'Secret-scan allowlist changed.' });
    expect(publish).not.toHaveBeenCalled();
  });

  it('preserves explicit release-note fallback metadata for the renderer', async () => {
    const generated = {
      markdown: '# v1.0.1\n\n## Changelog\n- fix',
      source: 'fallback' as const,
      warning: 'AI generation failed; deterministic release notes were generated instead.',
    };
    const aiService = { generateReleaseNotes: vi.fn().mockResolvedValue(generated) } as any;
    registerAiHandlers({
      aiService,
      readSettingsWithMigration: vi.fn(() => ({})) as any,
      getGeminiApiKeyFromSecureStore: vi.fn(() => ''),
      getOpenAiApiKeyFromSecureStore: vi.fn(() => ''),
      getActiveRepoPath: () => '/tmp/repo',
      secretScanService: { scanStagedDiffs: vi.fn() } as any,
    });

    const result = await handlers.get('ai:generateReleaseNotes')!(
      {},
      {
        tagName: 'v1.0.1',
        releaseName: 'v1.0.1',
        commits: [{ hash: 'abc', shortHash: 'abc', subject: 'fix', description: 'Preserve settings and migrate keys.', author: 'A', date: '2026-07-11' }],
        language: 'en',
        versionBump: 'patch',
      },
    );

    expect(result).toEqual({ success: true, data: generated });
    expect(aiService.generateReleaseNotes).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ commits: [expect.objectContaining({ description: 'Preserve settings and migrate keys.' })] }),
      expect.anything(),
    );
  });
});
