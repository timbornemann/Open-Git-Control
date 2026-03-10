import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { AppSettings } from '../settings';

const baseSettings: AppSettings = {
  theme: 'dark',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  aiAutoCommitEnabled: true,
  aiProvider: 'gemini',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-1.5-flash',
  hasGeminiApiKey: true,
};

const fakeGitService = {
  getRepoPath: () => '/tmp/repo',
  getStatusPorcelain: vi.fn(async () => ''),
  runCommand: vi.fn(async () => ''),
} as any;

describe('AiService gemini secret access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails when no gemini api key is available', async () => {
    const service = new AiService(fakeGitService);
    await expect(service.testConnection(baseSettings, () => '')).rejects.toThrow('Gemini API key fehlt.');
  });

  it('fails when secure key access throws', async () => {
    const service = new AiService(fakeGitService);
    await expect(service.listModels(baseSettings, () => { throw new Error('secret backend unavailable'); })).rejects.toThrow('secret backend unavailable');
  });

  it('uses secure key when present', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    await service.listModels(baseSettings, () => 'secure-key-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('key=secure-key-123');
  });
});
