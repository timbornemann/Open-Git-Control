import { describe, expect, it } from 'vitest';
import { detectReleaseVersionBump, suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';

describe('suggestNextReleaseTag', () => {
  it('returns default tag when no valid tags are available', () => {
    expect(suggestNextReleaseTag([])).toBe('v0.1.0');
    expect(suggestNextReleaseTag(['foo', 'release-1', '1.2'])).toBe('v0.1.0');
  });

  it('increments highest semver patch tag', () => {
    expect(suggestNextReleaseTag(['v1.2.3', 'v1.2.9', 'v1.10.0'])).toBe('v1.10.1');
    expect(suggestNextReleaseTag(['v2.0.0', 'v1.999.999'])).toBe('v2.0.1');
  });

  it('increments minor and major versions while resetting lower components', () => {
    expect(suggestNextReleaseTag(['v1.2.9'], 'minor')).toBe('v1.3.0');
    expect(suggestNextReleaseTag(['v1.2.9'], 'major')).toBe('v2.0.0');
  });

  it('returns sensible starting versions for repositories without semver tags', () => {
    expect(suggestNextReleaseTag([], 'patch')).toBe('v0.1.0');
    expect(suggestNextReleaseTag([], 'minor')).toBe('v0.1.0');
    expect(suggestNextReleaseTag([], 'major')).toBe('v1.0.0');
  });

  it('preserves unprefixed version formats in suggestions', () => {
    expect(suggestNextReleaseTag(['1.4.2'])).toBe('1.4.3');
    expect(suggestNextReleaseTag(['1.4.2'], 'minor')).toBe('1.5.0');
    expect(suggestNextReleaseTag(['1.4.2'], 'major')).toBe('2.0.0');
    expect(suggestNextReleaseTag(['  1.4.2  ', 'invalid'])).toBe('1.4.3');
  });

  it('keeps explicit uppercase/lowercase prefix from the winning tag', () => {
    expect(suggestNextReleaseTag(['V3.1.9', 'v2.9.9'])).toBe('V3.1.10');
  });

  it('handles non-array runtime values defensively', () => {
    const unsafeInput = null as unknown as string[];
    expect(suggestNextReleaseTag(unsafeInput)).toBe('v0.1.0');
  });
});

describe('detectReleaseVersionBump', () => {
  it('detects major, minor, and patch changes', () => {
    expect(detectReleaseVersionBump('v1.2.3', 'v2.0.0')).toBe('major');
    expect(detectReleaseVersionBump('v1.2.3', 'v1.4.0')).toBe('minor');
    expect(detectReleaseVersionBump('v1.2.3', 'v1.2.8')).toBe('patch');
  });

  it('returns null for invalid, unchanged, or lower versions', () => {
    expect(detectReleaseVersionBump(null, 'v1.0.0')).toBeNull();
    expect(detectReleaseVersionBump('v1.2.3', 'next')).toBeNull();
    expect(detectReleaseVersionBump('v1.2.3', 'v1.2.3')).toBeNull();
    expect(detectReleaseVersionBump('v2.0.0', 'v1.9.9')).toBeNull();
  });
});
