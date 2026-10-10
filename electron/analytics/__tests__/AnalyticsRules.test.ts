import { describe, expect, it } from 'vitest';
import { parseMailmapIdentity } from '../AnalyticsRules';

const reference = (line: string) => {
  const match = /^(.*?)\s*<([^>]*)>$/.exec(line);
  return match ? { name: match[1].trim(), email: match[2] } : null;
};

describe('parseMailmapIdentity', () => {
  it('matches the previous Name <email> grammar', () => {
    for (const line of ['Ada Lovelace <ada@example.test>', '<>', 'No Email', '>', 'a > <b>', 'a <b> <c>', 'a <b<c>', 'Trailing   <x@y>', 'a <b> c']) {
      expect(parseMailmapIdentity(line)).toEqual(reference(line));
    }
  });

  it('stays linear for crafted author names from repository history', () => {
    const startedAt = Date.now();
    expect(parseMailmapIdentity(`a${' '.repeat(1024 * 1024)}b <mail@example.test>`)?.email).toBe('mail@example.test');
    expect(parseMailmapIdentity(`a${' '.repeat(1024 * 1024)}b`)).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
