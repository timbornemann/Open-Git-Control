import { expect, it } from 'vitest';
import { DemoRepository, DEMO_TIME, type DemoCommit } from './demoRepository';
import { createDemoHistory } from './demoHistoryFixture';
import { practiceCommitHash as id } from '@/shared/tutorial/exampleGitIds';
import { demoAncestors, demoCommitChanges, demoCommitStats, demoFileHistory, demoFileBlame, resolveDemoCommit } from './demoHistory';
import { type DemoFiles, setDemoBlob } from './demoBlob';
import { writeDemoFile, writeDemoIndexFile } from './demoFiles';
const head: DemoFiles = {
  'README.md': '# OGC-Lernprojekt\n\nHallo Welt!\n',
  LICENSE: 'MIT\n',
  'package.json': '{"name":"sample"}\n',
  'src/app.ts': 'export const greeting = "Hallo Welt!";\n',
  'docs/guide.md': '# Guide\n',
};
function setup() {
  const repo = new DemoRepository();
  repo.files = structuredClone(head);
  repo.indexFiles = structuredClone(head);
  repo.headFiles = structuredClone(head);
  repo.tracked = new Set(Object.keys(head));
  repo.commits = createDemoHistory(head, DEMO_TIME, 'en');
  return repo;
}
function append(repo: DemoRepository, number: number, files: DemoFiles, subject: string) {
  const commit: DemoCommit = {
    hash: id(number),
    parent: repo.commits[0].hash,
    subject,
    date: new Date(DEMO_TIME + number * 86_400_000).toISOString(),
    files: structuredClone(files),
  };
  repo.commits.unshift(commit);
  repo.headFiles = structuredClone(files);
  repo.files = structuredClone(files);
  repo.indexFiles = structuredClone(files);
  return commit;
}
it('resolves actual revisions, their parents and root ancestry without guessing unknown hashes', () => {
  const repo = setup();
  expect(resolveDemoCommit(repo, 'HEAD')).toBe(repo.commits[0]);
  expect(resolveDemoCommit(repo, 'HEAD^')).toBe(repo.commits[1]);
  expect(resolveDemoCommit(repo, 'HEAD^0')).toBe(repo.commits[0]);
  expect(resolveDemoCommit(repo, 'HEAD~3')).toBe(repo.commits[3]);
  expect(resolveDemoCommit(repo, id(2).slice(0, 7))).toBe(repo.commits[2]);
  expect(resolveDemoCommit(repo, id(1) + '^')).toBeUndefined();
  expect(resolveDemoCommit(repo, 'missing')).toBeUndefined();
  expect(demoAncestors(repo).map((commit) => commit.hash)).toEqual([id(4), id(3), id(2), id(1)]);
});
it('reports only actual file changes, with anchored and paginated history', () => {
  const repo = setup();
  expect(demoFileHistory(repo, 'README.md').map((entry) => entry.hash)).toEqual([id(4), id(3), id(2), id(1)]);
  expect(demoFileHistory(repo, 'src/app.ts').map((entry) => entry.hash)).toEqual([id(4), id(2)]);
  expect(demoFileHistory(repo, 'LICENSE').map((entry) => entry.hash)).toEqual([id(1)]);
  expect(demoFileHistory(repo, 'missing.txt')).toEqual([]);
  expect(demoFileHistory(repo, 'README.md', id(2)).map((entry) => entry.hash)).toEqual([id(2), id(1)]);
  expect(demoFileHistory(repo, 'README.md', id(2), 2, { includeFuture: true, offset: 1 }).map((entry) => entry.hash)).toEqual([id(3), id(2)]);
});
it('derives the actual file/line statistics from the same saved trees', () => {
  const repo = setup();
  expect(demoCommitChanges(repo, repo.commits[3])).toEqual([
    { path: 'LICENSE', status: 'A' },
    { path: 'README.md', status: 'A' },
  ]);
  expect(demoCommitStats(repo, repo.commits[3])).toEqual({ files: 2, additions: 2, deletions: 0 });
  expect(demoCommitStats(repo, repo.commits[2])).toEqual({ files: 3, additions: 4, deletions: 0 });
  expect(demoCommitStats(repo, repo.commits[0])).toEqual({ files: 2, additions: 2, deletions: 4 });
});
it('attributes preserved and changed lines to their actual introducing commits', () => {
  const repo = setup();
  const lines = demoFileBlame(repo, 'README.md');
  expect(lines.map((line) => [line.lineNumber, line.content, line.commitHash])).toEqual([
    [1, '# OGC-Lernprojekt', id(1)],
    [2, '', id(2)],
    [3, 'Hallo Welt!', id(4)],
  ]);
  expect(lines.map((line) => line.author)).toEqual(['Sam Beispiel', 'Sam Beispiel', 'Alex Beispiel']);
  expect(lines[2].authorTime).toBe(String(DEMO_TIME / 1_000));
  expect(demoFileBlame(repo, 'src/app.ts')[0].commitHash).toBe(id(4));
});
it('keeps worktree, index and historical blame sources separate', () => {
  const repo = setup();
  writeDemoFile(repo, 'README.md', head['README.md'] + 'Working note\n');
  writeDemoIndexFile(repo, 'README.md', head['README.md'] + 'Staged note\n');
  expect(demoFileBlame(repo, 'README.md').at(-1)).toMatchObject({ content: 'Working note', commitHash: '0'.repeat(40) });
  expect(demoFileBlame(repo, 'README.md', undefined, 'staged').at(-1)).toMatchObject({ content: 'Staged note', commitHash: '0'.repeat(40) });
  const historical = demoFileBlame(repo, 'README.md', id(2));
  expect(historical).toHaveLength(3);
  expect(historical[2]).toMatchObject({ content: 'A small example project.', commitHash: id(2), author: 'Sam Beispiel' });
});
it('follows renames in both directions and stops at deletion before a reused path', () => {
  const repo = setup();
  const renamed = structuredClone(repo.headFiles);
  renamed['notes/guide.md'] = renamed['docs/guide.md'];
  delete renamed['docs/guide.md'];
  const move = append(repo, 5, renamed, 'Rename guide');
  expect(demoCommitChanges(repo, move)).toEqual([{ status: 'R', path: 'notes/guide.md', previousPath: 'docs/guide.md' }]);
  expect(demoCommitStats(repo, move)).toEqual({ files: 1, additions: 0, deletions: 0 });
  const modified = { ...renamed, 'notes/guide.md': '# Guide\nExtra context\n' };
  append(repo, 6, modified, 'Extend guide');
  expect(demoFileBlame(repo, 'notes/guide.md').map((line) => line.commitHash)).toEqual([id(3), id(6)]);
  const deleted = structuredClone(modified);
  delete deleted['notes/guide.md'];
  append(repo, 7, deleted, 'Delete guide');
  append(repo, 8, { ...deleted, 'notes/guide.md': 'Unrelated replacement\n' }, 'Reuse the path');
  const history = demoFileHistory(repo, 'docs/guide.md', id(3), 100, { includeFuture: true });
  expect(history.map((entry) => [entry.hash, entry.path])).toEqual([
    [id(7), 'notes/guide.md'],
    [id(6), 'notes/guide.md'],
    [id(5), 'notes/guide.md'],
    [id(3), 'docs/guide.md'],
  ]);
  expect(demoFileHistory(repo, 'notes/guide.md', id(7), 100, { includeFuture: true })).toEqual(history);
  expect(demoFileHistory(repo, 'notes/guide.md').map((entry) => entry.hash)).toEqual([id(8)]);
});
it('keeps prototype-like filenames literal and avoids invented line statistics for binary data', () => {
  const repo = setup(),
    files = structuredClone(repo.headFiles);
  setDemoBlob(files, '__proto__', 'Legitimate file\n');
  setDemoBlob(files, 'binary.bin', '\0binary');
  const commit = append(repo, 5, files, 'Add unusual filenames');
  expect(demoCommitStats(repo, commit)).toEqual({ files: 2, additions: 1, deletions: 0 });
  expect(demoFileHistory(repo, '__proto__').map((entry) => entry.hash)).toEqual([id(5)]);
  expect(demoFileBlame(repo, '__proto__')[0]).toMatchObject({ content: 'Legitimate file', commitHash: id(5) });
  expect(() => demoFileBlame(repo, 'binary.bin')).toThrow('Binary');
});
