import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAiHandlers } from '../registerAiHandlers';
import { registerGitHandlers } from '../registerGitHandlers';
import { beginCommitProtection, ensureCommitProtectionIsIdle } from '../../RepositoryCommitProtection';
import { RepoJobRegistry } from '../../repoJobRegistry';
import { DEFAULT_SETTINGS } from '../../../settings';

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: handleMock }, shell: { openPath: vi.fn() } }));
const handlers = new Map<string, (...args: any[]) => Promise<any>>();
const event = { sender: { send: vi.fn() } };
const repoPath = '/tmp/ai-commit-guard';
const result = {
  outcome: 'cancelled',
  commits: [],
  groups: [],
  summary: 'Cancelled',
  modeTransitions: ['normal'],
  processedFiles: 0,
  remainingFiles: 1,
  commitPlanStats: { totalCommits: 0 },
};

function install(run: (...args: any[]) => Promise<any>, registry = new RepoJobRegistry()) {
  const aiService = { runAutoCommitWithOptions: vi.fn(run) } as any;
  registerAiHandlers({
    aiService,
    readSettingsWithMigration: () => DEFAULT_SETTINGS,
    getGeminiApiKeyFromSecureStore: () => '',
    getOpenAiApiKeyFromSecureStore: () => '',
    getActiveRepoPath: () => repoPath,
    secretScanService: {} as any,
    repoJobRegistry: registry,
  });
  return aiService;
}
beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  handleMock.mockImplementation((name: string, handler: (...args: any[]) => Promise<any>) => {
    handlers.set(name, handler);
  });
});

describe('shared AI commit protection', () => {
  it('rejects AI while another protected repository write is running', async () => {
    const service = install(async () => result);
    const release = beginCommitProtection(repoPath)!;
    try {
      const response = await handlers.get('git:aiAutoCommit')!(event, { repoPath });
      expect(response.success).toBe(false);
      expect(response.error).toContain('protected commit operation');
      expect(service.runAutoCommitWithOptions).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it('blocks staging and manual commits during AI planning and releases after cancellation', async () => {
    let resolve!: (value: unknown) => void;
    install(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const commits = { stagePathsAtPath: vi.fn(), commitWithMessageAtPath: vi.fn() };
    registerGitHandlers({
      gitService: { getRepoPath: () => repoPath, commits } as any,
      secretScanService: {} as any,
      workingTreeService: {} as any,
      commitStatsService: { onUpdate: vi.fn(), interruptBackgroundWork: vi.fn() } as any,
      readSettingsWithMigration: () => DEFAULT_SETTINGS,
    });
    const running = handlers.get('git:aiAutoCommit')!(event, { repoPath });
    try {
      expect(() => ensureCommitProtectionIsIdle(repoPath)).toThrow('protected commit operation');
      expect((await handlers.get('git:stagePaths')!(event, ['changed.ts'], repoPath)).error).toContain('protected commit operation');
      expect((await handlers.get('git:createCommit')!(event, { repoPath, title: 'manual' })).error).toContain('protected commit operation');
      expect(commits.stagePathsAtPath).not.toHaveBeenCalled();
      expect(commits.commitWithMessageAtPath).not.toHaveBeenCalled();
      expect((await handlers.get('git:aiAutoCommit')!(event, { repoPath })).success).toBe(false);
      await handlers.get('git:cancelAiAutoCommit')!(event);
    } finally {
      resolve(result);
      await running;
    }
    expect(() => ensureCommitProtectionIsIdle(repoPath)).not.toThrow();
  });

  it('invalidates the pending run on repository switches and always releases the guard', async () => {
    const registry = new RepoJobRegistry();
    let resolve!: () => void;
    install(async (_repo, _settings, _key, _progress, cancelled) => {
      await new Promise<void>((done) => {
        resolve = done;
      });
      expect(cancelled()).toBe(true);
      throw new Error('Repository changed');
    }, registry);
    const running = handlers.get('git:aiAutoCommit')!(event, { repoPath });
    registry.cancelForRepoChange('/tmp/next');
    resolve();
    expect((await running).error).toContain('Repository-Wechsel');
    expect(() => ensureCommitProtectionIsIdle(repoPath)).not.toThrow();
  });
});
