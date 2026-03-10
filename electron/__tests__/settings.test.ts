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
});
