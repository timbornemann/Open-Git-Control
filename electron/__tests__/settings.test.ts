import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';

describe('normalizeSettings', () => {
  it('returns defaults when input is missing', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('normalizes theme and language with safe fallbacks', () => {
    expect(normalizeSettings({ theme: 'light', language: 'en' })).toMatchObject({
      theme: 'porcelain-light',
      language: 'en',
    });

    expect(normalizeSettings({ theme: 'midnight-teal', language: 'en' })).toMatchObject({
      theme: 'midnight-teal',
      language: 'en',
    });

    expect(normalizeSettings({ theme: 'dark' as never, language: 'en' })).toMatchObject({
      theme: 'copper-night',
      language: 'en',
    });

    expect(normalizeSettings({ theme: 'invalid' as never, language: 'fr' as never })).toMatchObject({
      theme: 'copper-night',
      language: 'de',
    });
  });

  it('clamps auto fetch interval and trims branch name', () => {
    expect(normalizeSettings({ autoFetchIntervalMs: Number.NaN, defaultBranch: '  ' })).toMatchObject({
      autoFetchIntervalMs: DEFAULT_SETTINGS.autoFetchIntervalMs,
      defaultBranch: DEFAULT_SETTINGS.defaultBranch,
    });

    expect(normalizeSettings({ autoFetchIntervalMs: 9_999, defaultBranch: '  develop  ' })).toMatchObject({
      autoFetchIntervalMs: 10_000,
      defaultBranch: 'develop',
    });

    expect(normalizeSettings({ autoFetchIntervalMs: 999_999 })).toMatchObject({
      autoFetchIntervalMs: 300_000,
    });
  });

  it('normalizes booleans and commit template values', () => {
    const oversized = 'x'.repeat(9_000);

    const normalized = normalizeSettings({
      confirmDangerousOps: undefined,
      showSecondaryHistory: undefined,
      commitSignoffByDefault: true,
      aiAutoCommitEnabled: true,
      commitTemplate: oversized,
    });

    expect(normalized.confirmDangerousOps).toBe(true);
    expect(normalized.showSecondaryHistory).toBe(true);
    expect(normalized.commitSignoffByDefault).toBe(true);
    expect(normalized.aiAutoCommitEnabled).toBe(true);
    expect(normalized.commitTemplate.length).toBe(8_000);
    expect(normalizeSettings({ commitTemplate: 42 as never }).commitTemplate).toBe('');
    expect(normalizeSettings({ commitTemplate: 'feat: useful message' }).commitTemplate).toBe('feat: useful message');
  });

  it('normalizes AI provider and ollama base URL', () => {
    expect(normalizeSettings({ aiProvider: 'gemini' })).toMatchObject({ aiProvider: 'gemini' });
    expect(normalizeSettings({ aiProvider: 'invalid' as never })).toMatchObject({ aiProvider: 'ollama' });

    expect(normalizeSettings({ ollamaBaseUrl: '  http://localhost:11434/  ' }).ollamaBaseUrl).toBe('http://localhost:11434');
    expect(normalizeSettings({ ollamaBaseUrl: '   ' }).ollamaBaseUrl).toBe(DEFAULT_SETTINGS.ollamaBaseUrl);
    expect(normalizeSettings({ ollamaBaseUrl: 'ftp://localhost:11434' }).ollamaBaseUrl).toBe(DEFAULT_SETTINGS.ollamaBaseUrl);
    expect(normalizeSettings({ ollamaBaseUrl: 'not a url' }).ollamaBaseUrl).toBe(DEFAULT_SETTINGS.ollamaBaseUrl);
    expect(normalizeSettings({ ollamaBaseUrl: 123 as never }).ollamaBaseUrl).toBe(DEFAULT_SETTINGS.ollamaBaseUrl);
  });

  it('normalizes model values and gemini key presence flag', () => {
    const veryLong = 'm'.repeat(500);

    const normalized = normalizeSettings({
      ollamaModel: `  ${veryLong}  `,
      geminiModel: '   ',
      hasGeminiApiKey: true,
    });

    expect(normalized.ollamaModel.length).toBe(200);
    expect(normalized.geminiModel).toBe(DEFAULT_SETTINGS.geminiModel);
    expect(normalized.hasGeminiApiKey).toBe(true);
    expect(normalizeSettings({ hasGeminiApiKey: 'yes' as never }).hasGeminiApiKey).toBe(false);
  });

  it('normalizes github oauth client id', () => {
    expect(normalizeSettings({ githubOauthClientId: '  Ov23abc  ' }).githubOauthClientId).toBe('Ov23abc');

    const longClientId = 'x'.repeat(250);
    expect(normalizeSettings({ githubOauthClientId: longClientId }).githubOauthClientId.length).toBe(200);

    expect(normalizeSettings({ githubOauthClientId: 123 as never }).githubOauthClientId).toBe('');
  });
  it('normalizes github host with safe fallback rules', () => {
    expect(normalizeSettings({ githubHost: '  HTTPS://GitHub.Example.com:8443///  ' }).githubHost).toBe('github.example.com:8443');
    expect(normalizeSettings({ githubHost: '   ' }).githubHost).toBe(DEFAULT_SETTINGS.githubHost);
    expect(normalizeSettings({ githubHost: 'github.com/path' }).githubHost).toBe(DEFAULT_SETTINGS.githubHost);
    expect(normalizeSettings({ githubHost: 123 as never }).githubHost).toBe(DEFAULT_SETTINGS.githubHost);

    const longHost = 'https://' + 'a'.repeat(220) + '.example.com';
    const normalizedLongHost = normalizeSettings({ githubHost: longHost }).githubHost;
    expect(normalizedLongHost.length).toBeLessThanOrEqual(200);
    expect(normalizedLongHost).not.toContain('http://');
    expect(normalizedLongHost).not.toContain('https://');
  });
});

