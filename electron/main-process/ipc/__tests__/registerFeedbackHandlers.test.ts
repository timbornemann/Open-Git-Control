import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, handleMock } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.3.0'), getPath: vi.fn(() => 'C:/temp') },
  ipcMain: { handle: handleMock },
}));

import { registerFeedbackHandlers } from '../registerFeedbackHandlers';

const bugReport = {
  category: 'bug' as const,
  submissionMode: 'manual' as const,
  source: 'settings' as const,
  title: 'Broken editor',
  area: 'Repository workspace' as const,
  steps: 'Open editor',
  expected: 'It works',
  actual: 'It fails',
};

describe('registerFeedbackHandlers', () => {
  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    handleMock.mockImplementation((channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler));
  });

  it('returns capability and a browser fallback without authentication', async () => {
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: vi.fn(() => false),
        normalizeHost: vi.fn((value) => value),
        getHost: vi.fn(() => 'github.com'),
      } as any,
      historyStore: {} as any,
    });

    await expect(handlers.get('feedback:getCapability')!({})).resolves.toEqual({ directSubmissionAvailable: false, reason: 'not-authenticated' });
    const result = await handlers.get('feedback:submit')!({}, bugReport);
    expect(result).toMatchObject({ success: false, code: 'DIRECT_UNAVAILABLE' });
    expect(result.fallbackUrl).toContain('github.com/timbornemann/Open-Git-Control/issues/new');
    expect(result.fallbackUrl).toContain('template=bug_report.yml');
  });

  it('never returns a browser fallback for automatic submissions on the wrong host', async () => {
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: vi.fn(() => true),
        normalizeHost: vi.fn((value) => value),
        getHost: vi.fn(() => 'github.enterprise.test'),
      } as any,
      historyStore: {} as any,
    });

    const result = await handlers.get('feedback:submit')!(
      {},
      {
        category: 'bug',
        submissionMode: 'automatic',
        source: 'error-toast',
        title: 'Failure',
        area: 'Settings',
        errorMessage: 'Something failed',
      },
    );
    expect(result).toEqual({ success: false, code: 'DIRECT_UNAVAILABLE', error: 'Direct reports require a GitHub.com session.' });
  });

  it('creates direct manual issues and maps automatic deduplication results', async () => {
    const createFeedbackIssue = vi.fn().mockResolvedValue({ number: 12, htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/12' });
    const historyStore = {
      submit: vi.fn(async (_signature: string, create: () => Promise<{ number: number; htmlUrl: string }>) => {
        const issue = await create();
        return { kind: 'duplicate', issueNumber: issue.number, htmlUrl: issue.htmlUrl };
      }),
    };
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: vi.fn(() => true),
        normalizeHost: vi.fn((value) => value),
        getHost: vi.fn(() => 'github.com'),
        createFeedbackIssue,
      } as any,
      historyStore: historyStore as any,
    });

    await expect(handlers.get('feedback:submit')!({}, bugReport)).resolves.toMatchObject({
      success: true,
      data: { issueNumber: 12, deduplicated: false },
    });
    await expect(
      handlers.get('feedback:submit')!(
        {},
        {
          category: 'bug',
          submissionMode: 'automatic',
          source: 'error-toast',
          title: 'Failure',
          area: 'Settings',
          errorMessage: 'Something failed',
        },
      ),
    ).resolves.toMatchObject({ success: true, data: { issueNumber: 12, deduplicated: true } });
    expect(createFeedbackIssue).toHaveBeenCalledWith(expect.stringMatching(/^\[Bug\]:/), expect.stringContaining('## Actual behavior'), 'bug');
  });
});
