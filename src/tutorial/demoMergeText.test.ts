import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { mergeDemoText } from './demoMergeText';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-demo-merge-text-'))
      throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
const cases = [
  { name: 'separate lines', base: 'a\nb\nc\n', ours: 'A\nb\nc\n', theirs: 'a\nb\nC\n' },
  { name: 'adjacent lines', base: 'a\nb\nc\n', ours: 'A\nb\nc\n', theirs: 'a\nB\nc\n' },
  { name: 'identical edit', base: 'a\nb\n', ours: 'A\nb\n', theirs: 'A\nb\n' },
  { name: 'append and distant edit', base: 'a\nb\nc\nd\n', ours: 'a\nb\nc\nd\ne\n', theirs: 'A\nb\nc\nd\n' },
  { name: 'separate deletions', base: 'a\nb\nc\nd\ne\n', ours: 'a\nc\nd\ne\n', theirs: 'a\nb\nc\ne\n' },
  { name: 'competing insertions', base: 'a\nb\n', ours: 'a\nx\nb\n', theirs: 'a\ny\nb\n' },
  { name: 'same line', base: 'a\nb\nc\n', ours: 'a\nours\nc\n', theirs: 'a\ntheirs\nc\n' },
  { name: 'add/add', base: '', ours: 'ours\n', theirs: 'theirs\n' },
  { name: 'missing final newline', base: 'a\nb', ours: 'A\nb', theirs: 'a\nB' },
  { name: 'CRLF conflict', base: 'a\r\nb\r\nc\r\n', ours: 'a\r\nours\r\nc\r\n', theirs: 'a\r\ntheirs\r\nc\r\n' },
  { name: 'shared changed prefix', base: 'a\nb\nc\nd\n', ours: 'A\nours\nc\nd\n', theirs: 'A\ntheirs\nc\nd\n' },
];
it.each(cases)('matches real Git merge-file for $name', ({ base, ours, theirs }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-demo-merge-text-'));
  roots.push(root);
  const config = path.join(root, 'empty-config');
  fs.writeFileSync(config, '');
  for (const [name, contents] of Object.entries({ base, ours, theirs })) fs.writeFileSync(path.join(root, name), contents);
  const actual = spawnSync('git', ['merge-file', '-p', '-L', 'HEAD', '-L', 'base', '-L', 'incoming', 'ours', 'base', 'theirs'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' },
  });
  expect(actual.error).toBeUndefined();
  expect([0, 1]).toContain(actual.status);
  const simulated = mergeDemoText(base, ours, theirs);
  expect(simulated.conflicted).toBe(actual.status === 1);
  expect(simulated.text).toBe(actual.stdout);
});
it('refuses an oversized exploratory merge before allocating a large LCS matrix', () => {
  const large = 'line\n'.repeat(1200);
  expect(() => mergeDemoText(large, large + 'ours\n', large + 'theirs\n')).toThrow(/large text merge/);
});
