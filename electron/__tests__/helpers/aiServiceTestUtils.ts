import { vi } from 'vitest';
import type { AppSettings } from '../../settings';

export const baseSettings: AppSettings = {
  theme: 'dark',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  autoUpdateEnabled: true,
  secretScanBeforePushEnabled: true,
  secretScanStrictness: 'medium',
  secretScanAllowlist: '',
  aiAutoCommitEnabled: true,
  aiProvider: 'gemini',
  aiCommitMessageStyle: 'conventional',
  aiCommitMessageLanguage: 'auto',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-1.5-flash',
  hasGeminiApiKey: true,
  githubOauthClientId: '',
  githubHost: 'github.com',
};

export const createFakeGitService = () =>
  ({
    getRepoPath: () => '/tmp/repo',
    getStatusPorcelain: vi.fn(async () => ''),
    runCommand: vi.fn(async () => ''),
  }) as any;

export const okJsonResponse = (json: unknown) => ({
  ok: true,
  json: async () => json,
  text: async () => JSON.stringify(json),
});
