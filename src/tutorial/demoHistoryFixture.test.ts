import { expect, it } from 'vitest';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { createDemoHistory } from './demoHistoryFixture';
import { getDemoBlob, type DemoFiles } from './demoBlob';
import { DEMO_TIME } from './demoRepository';
const head: DemoFiles = {
  'README.md': '# OGC-Lernprojekt\n\nHallo Welt!\n',
  LICENSE: 'Sample license\n',
  'package.json': '{"name":"practice"}\n',
  'src/app.ts': 'export const greeting = "Hallo Welt!";\n',
  'docs/guide.md': '# Guide\n',
};
it('gives fictional hashes unique readable prefixes even beyond sixteen commits', () => {
  const hashes = Array.from({ length: 10_000 }, (_, index) => practiceCommitHash(index + 1));
  expect(hashes.every((hash) => /^[a-f0-9]{40}$/.test(hash))).toBe(true);
  expect(new Set(hashes).size).toBe(hashes.length);
  expect(new Set(hashes.map((hash) => hash.slice(0, 7))).size).toBe(hashes.length);
});
it.each(['de', 'en'] as const)('creates coherent, independent project revisions in %s', (language) => {
  const commits = createDemoHistory(head, DEMO_TIME, language);
  expect(commits).toHaveLength(4);
  expect(commits[0].files).toEqual(head);
  expect(commits[0].files).not.toBe(head);
  expect(new Set(commits.map((commit) => getDemoBlob(commit.files!, 'README.md'))).size).toBe(4);
  expect(commits.map((commit) => commit.author)).toEqual(['Alex Beispiel', 'Alex Beispiel', 'Sam Beispiel', 'Sam Beispiel']);
  for (let index = 0; index < 3; index++) {
    expect(commits[index].parent).toBe(commits[index + 1].hash);
    expect(Date.parse(commits[index].date)).toBeGreaterThan(Date.parse(commits[index + 1].date));
  }
  expect(commits[3].parent).toBe('');
  expect(getDemoBlob(commits[3].files!, 'src/app.ts')).toBeUndefined();
  expect(getDemoBlob(commits[2].files!, 'src/app.ts')).toBe('export const greeting = "Hallo";\n');
  expect(getDemoBlob(commits[2].files!, 'docs/guide.md')).toBeUndefined();
  expect(getDemoBlob(commits[1].files!, 'docs/guide.md')).toBe('# Guide\n');
  commits[1].files!['docs/guide.md'] = 'Changed old snapshot\n';
  expect(head['docs/guide.md']).toBe('# Guide\n');
  expect(commits[0].files!['docs/guide.md']).toBe('# Guide\n');
});
