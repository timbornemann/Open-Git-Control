import { describe, expect, it } from 'vitest';
import { SecretAllowlistMatcher, type SecretAllowlistRule } from '../SecretAllowlistMatcher';

const candidate = { filePath: 'src/app.ts', line: `const token = ghp_${'a'.repeat(1000)};`, ruleId: 'github-token' };
const slowRules = (count: number): SecretAllowlistRule[] =>
  Array.from({ length: count }, (_, i) => ({ kind: 'regex', pattern: new RegExp(`^(.+)+END${i}$`), timedOut: false }));

describe('isolated repository allowlist matching', () => {
  it('keeps the main event loop responsive during expensive regexes and retains valid rules', async () => {
    const matcher = new SecretAllowlistMatcher([...slowRules(3), { kind: 'regex', pattern: /ghp_/i, timedOut: false }]);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 10);
    try {
      expect(await matcher.test(candidate)).toBe(true);
      expect(matcher.timedOutCount).toBe(3);
      expect(ticks).toBeGreaterThan(2);
      expect(await matcher.test({ ...candidate, line: 'nothing secret' })).toBe(false);
      expect(matcher.timedOutCount).toBe(3);
    } finally {
      clearInterval(timer);
      await matcher.dispose();
    }
  });

  it('stops pending regex matching when the scan is cancelled', async () => {
    const controller = new AbortController();
    const matcher = new SecretAllowlistMatcher(slowRules(20), controller.signal);
    const pending = matcher.test(candidate);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const timer = setTimeout(() => controller.abort(), 30);
    try {
      await rejected;
      await matcher.dispose();
      await expect(matcher.test(candidate)).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      clearTimeout(timer);
      await matcher.dispose();
    }
  });

  it('matches normalized paths and plain text in the original rule order', async () => {
    const matcher = new SecretAllowlistMatcher([{ kind: 'path', value: 'src/app.ts' }, ...slowRules(1)]);
    try {
      expect(await matcher.test({ ...candidate, filePath: 'SRC\\app.ts' })).toBe(true);
      expect(matcher.timedOutCount).toBe(0);
    } finally {
      await matcher.dispose();
    }
  });
});
