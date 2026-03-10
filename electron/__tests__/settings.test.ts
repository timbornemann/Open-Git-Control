import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';

describe('normalizeSettings', () => {
  it('returns defaults when input is missing', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('normalizes theme and language with safe fallbacks', () => {
    expect(normalizeSettings({ theme: 'light', language: 'en' })).toMatchObject({
      theme: 'light',
      language: 'en',
    });

    expect(normalizeSettings({ theme: 'invalid' as never, language: 'fr' as never })).toMatchObject({
      theme: 'dark',
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

  it('normalizes model values and gemini API key', () => {
    const veryLong = 'm'.repeat(500);

    const normalized = normalizeSettings({
      ollamaModel: `  ${veryLong}  `,
      geminiModel: '   ',
      geminiApiKey: `  ${'k'.repeat(600)}  `,
    });

    expect(normalized.ollamaModel.length).toBe(200);
    expect(normalized.geminiModel).toBe(DEFAULT_SETTINGS.geminiModel);
    expect(normalized.geminiApiKey.length).toBe(500);
    expect(normalizeSettings({ geminiApiKey: 123 as never }).geminiApiKey).toBe('');
  });
});