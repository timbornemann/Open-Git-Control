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

  it('previews the exact sanitized direct issue without publishing it', async () => {
    const createFeedbackIssue = vi.fn().mockResolvedValue({ number: 12, htmlUrl: 'https://github.com/example/12' });
    registerFeedbackHandlers({
      githubService: { isAuthenticated: () => true, normalizeHost: (value: string) => value, getHost: () => 'github.com', createFeedbackIssue } as any,
    });
    const input = {
      category: 'bug',
      submissionMode: 'manual',
      source: 'settings',
      actual: 'Editor failed\ntoken=github_pat_abcdefghijklmnopqrstuvwxyz123456',
      diagnostics: 'Reviewed diagnostic',
    };
    const preview = await handlers.get('feedback:preview')!({}, input);
    expect(preview).toMatchObject({ success: true, data: { title: '[Bug]: Editor failed', delivery: 'direct', diagnosticsIncluded: true, truncated: false } });
    expect(preview.data.body).not.toContain('github_pat_');
    expect(createFeedbackIssue).not.toHaveBeenCalled();
    await handlers.get('feedback:submit')!({}, input);
    expect(createFeedbackIssue).toHaveBeenCalledExactlyOnceWith(preview.data.title, preview.data.body, 'bug');
  });

  it('previews the browser payload without diagnostics when no account is connected or the browser route is explicitly selected', async () => {
    const createFeedbackIssue = vi.fn();
    registerFeedbackHandlers({
      githubService: { isAuthenticated: () => false, normalizeHost: (value: string) => value, getHost: () => 'github.com', createFeedbackIssue } as any,
    });
    const preview = await handlers.get('feedback:preview')!({}, { ...bugReport, diagnostics: 'Private diagnostic' });
    expect(preview).toMatchObject({ success: true, data: { delivery: 'browser', diagnosticsIncluded: false } });
    expect(preview.data.body).not.toContain('Private diagnostic');
    expect(preview.data.fallbackUrl).not.toContain('Private');
    expect(new URL(preview.data.fallbackUrl).searchParams.get('actual')).toBe('It fails');
    expect(createFeedbackIssue).not.toHaveBeenCalled();
    handlers.clear();
    registerFeedbackHandlers({
      githubService: { isAuthenticated: () => true, normalizeHost: (value: string) => value, getHost: () => 'github.com', createFeedbackIssue } as any,
    });
    expect(await handlers.get('feedback:preview')!({}, bugReport, 'browser')).toMatchObject({ success: true, data: { delivery: 'browser' } });
  });

  it('rejects invalid previews without any GitHub operation', async () => {
    const createFeedbackIssue = vi.fn();
    registerFeedbackHandlers({
      githubService: { isAuthenticated: () => true, normalizeHost: (value: string) => value, getHost: () => 'github.com', createFeedbackIssue } as any,
    });
    expect(await handlers.get('feedback:preview')!({}, { ...bugReport, actual: ' ' })).toMatchObject({ success: false });
    expect(await handlers.get('feedback:preview')!({}, bugReport, 'unknown')).toMatchObject({ success: false });
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it('returns capability and a browser fallback without authentication', async () => {
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: vi.fn(() => false),
        normalizeHost: vi.fn((value) => value),
        getHost: vi.fn(() => 'github.com'),
      } as any,
    });

    await expect(handlers.get('feedback:getCapability')!({})).resolves.toEqual({ directSubmissionAvailable: false, reason: 'not-authenticated' });
    const result = await handlers.get('feedback:submit')!({}, bugReport);
    expect(result).toMatchObject({ success: false, code: 'DIRECT_UNAVAILABLE' });
    expect(result.fallbackUrl).toContain('github.com/timbornemann/Open-Git-Control/issues/new');
    expect(result.fallbackUrl).toContain('template=bug_report.yml');
  });

  it('rejects automatic submissions before an issue can be created', async () => {
    const createFeedbackIssue = vi.fn();
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: vi.fn(() => true),
        normalizeHost: vi.fn((value) => value),
        getHost: vi.fn(() => 'github.com'),
        createFeedbackIssue,
      } as any,
    });

    await expect(
      handlers.get('feedback:submit')!({}, { ...bugReport, submissionMode: 'automatic', source: 'error-toast', errorMessage: 'Something failed' }),
    ).resolves.toMatchObject({ success: false, code: 'VALIDATION_FAILED', error: 'Only manual feedback reports are supported.' });
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it('creates direct manual issues', async () => {
    const createFeedbackIssue = vi.fn().mockResolvedValue({ number: 12, htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/12' });
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: vi.fn(() => true),
        normalizeHost: vi.fn((value) => value),
        getHost: vi.fn(() => 'github.com'),
        createFeedbackIssue,
      } as any,
    });

    await expect(handlers.get('feedback:submit')!({}, bugReport)).resolves.toMatchObject({
      success: true,
      data: { issueNumber: 12, deduplicated: false },
    });
    expect(createFeedbackIssue).toHaveBeenCalledWith(expect.stringMatching(/^\[Bug\]:/), expect.stringContaining('## Actual behavior'), 'bug');
  });

  it('uses an independent GitHub.com account while the legacy session is Enterprise', async () => {
    const legacyCreate = vi.fn();
    const publicCreate = vi.fn().mockResolvedValue({ number: 18, htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/18' });
    const dispose = vi.fn();
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: () => true,
        normalizeHost: (value: string) => value,
        getHost: () => 'enterprise.test',
        createFeedbackIssue: legacyCreate,
      } as any,
      hasPublicGithubConnection: () => true,
      createPublicGithubSession: async () => ({
        client: { isAuthenticated: () => true, normalizeHost: (value: string) => value, getHost: () => 'github.com', createFeedbackIssue: publicCreate } as any,
        dispose,
      }),
    });
    expect(await handlers.get('feedback:getCapability')!({})).toEqual({ directSubmissionAvailable: true, reason: null });
    expect(await handlers.get('feedback:submit')!({}, bugReport)).toMatchObject({ success: true, data: { issueNumber: 18 } });
    expect(publicCreate).toHaveBeenCalledOnce();
    expect(legacyCreate).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('does not silently use another account when the selected public account fails validation', async () => {
    const legacyCreate = vi.fn();
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: () => true,
        normalizeHost: (value: string) => value,
        getHost: () => 'github.com',
        createFeedbackIssue: legacyCreate,
      } as any,
      hasPublicGithubConnection: () => true,
      createPublicGithubSession: async () => {
        throw new Error('The account changed.');
      },
    });
    expect(await handlers.get('feedback:submit')!({}, bugReport)).toMatchObject({ success: false, code: 'GITHUB_FAILED' });
    expect(legacyCreate).not.toHaveBeenCalled();
  });

  it('does not revive an old legacy session after all public registry accounts logged out', async () => {
    const legacyCreate = vi.fn();
    registerFeedbackHandlers({
      githubService: {
        isAuthenticated: () => true,
        normalizeHost: (value: string) => value,
        getHost: () => 'github.com',
        createFeedbackIssue: legacyCreate,
      } as any,
      hasPublicGithubConnection: () => false,
      createPublicGithubSession: async () => null,
    });
    expect(await handlers.get('feedback:getCapability')!({})).toEqual({ directSubmissionAvailable: false, reason: 'not-authenticated' });
    expect(await handlers.get('feedback:submit')!({}, bugReport)).toMatchObject({ success: false, code: 'DIRECT_UNAVAILABLE' });
    expect(legacyCreate).not.toHaveBeenCalled();
  });
});
