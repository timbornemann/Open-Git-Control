import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';

describe('normalizeSettings', () => {
  it('returns defaults when values are missing', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps auto fetch interval and trims default branch', () => {
    const result = normalizeSettings({
      autoFetchIntervalMs: 999999,
      defaultBranch: '  develop  ',
      theme: 'light',
      language: 'en',
    });

    expect(result.autoFetchIntervalMs).toBe(300000);
    expect(result.defaultBranch).toBe('develop');
    expect(result.theme).toBe('light');
    expect(result.language).toBe('en');
  });

  it('sanitizes invalid booleans and oversized commit template', () => {
    const oversized = 'x'.repeat(9000);
    const result = normalizeSettings({
      confirmDangerousOps: undefined,
      showSecondaryHistory: undefined,
      commitSignoffByDefault: true,
      commitTemplate: oversized,
    });

    expect(result.confirmDangerousOps).toBe(true);
    expect(result.showSecondaryHistory).toBe(true);
    expect(result.commitSignoffByDefault).toBe(true);
    expect(result.commitTemplate.length).toBe(8000);
  });

  it('normalizes ollama settings', () => {
    const result = normalizeSettings({
      aiAutoCommitEnabled: true,
      aiProvider: 'ollama',
      ollamaBaseUrl: '  http://localhost:11434/  ',
      ollamaModel: '  llama3.1:8b  ',
    });

    expect(result.aiAutoCommitEnabled).toBe(true);
    expect(result.aiProvider).toBe('ollama');
    expect(result.ollamaBaseUrl).toBe('http://localhost:11434');
    expect(result.ollamaModel).toBe('llama3.1:8b');
  });

  it('normalizes gemini settings', () => {
    const result = normalizeSettings({
      aiProvider: 'gemini',
      geminiApiKey: '  api-key  ',
      geminiModel: '  gemini-3-flash-preview  ',
    });

    expect(result.aiProvider).toBe('gemini');
    expect(result.geminiApiKey).toBe('api-key');
    expect(result.geminiModel).toBe('gemini-3-flash-preview');
  });
});
