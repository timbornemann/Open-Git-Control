import { describe, expect, it } from 'vitest';
import { suggestNextReleaseTag } from '../releaseTagSuggestion';

describe('suggestNextReleaseTag', () => {
  it('returns default tag when no valid tags are available', () => {
    expect(suggestNextReleaseTag([])).toBe('v0.1.0');
    expect(suggestNextReleaseTag(['foo', 'release-1', '1.2'])).toBe('v0.1.0');
  });

  it('increments highest semver patch tag', () => {
    expect(suggestNextReleaseTag(['v1.2.3', 'v1.2.9', 'v1.10.0'])).toBe('v1.10.1');
    expect(suggestNextReleaseTag(['v2.0.0', 'v1.999.999'])).toBe('v2.0.1');
  });

  it('normalizes tags without v-prefix to v-prefix in suggestion', () => {
    expect(suggestNextReleaseTag(['1.4.2'])).toBe('v1.4.3');
    expect(suggestNextReleaseTag(['  1.4.2  ', 'invalid'])).toBe('v1.4.3');
  });

  it('keeps explicit uppercase/lowercase prefix from the winning tag', () => {
    expect(suggestNextReleaseTag(['V3.1.9', 'v2.9.9'])).toBe('V3.1.10');
  });

  it('handles non-array runtime values defensively', () => {
    const unsafeInput = null as unknown as string[];
    expect(suggestNextReleaseTag(unsafeInput)).toBe('v0.1.0');
  });
});
