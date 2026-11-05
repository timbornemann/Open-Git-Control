import { expect, it } from 'vitest';
import { DemoRepository, hashFor, type DemoCommit } from './demoRepository';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { demoLineHistory } from './demoLineHistory';
import { writeDemoFile, writeDemoIndexFile } from './demoFiles';
import type { DemoFiles } from './demoBlob';
const setup = () => {
  const repo = new DemoRepository();
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  return repo;
};
const hashes = (repo: DemoRepository, start: number, end: number, path = 'README.md') => demoLineHistory(repo, path, start, end).map((commit) => commit.hash);
it('matches native Git line history for the heading, greeting, status and full README', () => {
  const repo = setup();
  expect(hashes(repo, 1, 1)).toEqual([hashFor(1)]);
  expect(hashes(repo, 3, 3)).toEqual([hashFor(4), hashFor(3), hashFor(2)]);
  expect(hashes(repo, 4, 4)).toEqual([hashFor(4), hashFor(3), hashFor(2)]);
  expect(hashes(repo, 1, 4)).toEqual([hashFor(4), hashFor(3), hashFor(2), hashFor(1)]);
  expect(hashes(repo, 1, 1, 'src/app.ts')).toEqual([hashFor(4), hashFor(2)]);
  expect(demoLineHistory(repo, 'README.md', 3, 3, 1).map((commit) => commit.hash)).toEqual([hashFor(4)]);
});
it('tracks saved HEAD lines independently of changed working/index contents', () => {
  const repo = setup();
  writeDemoFile(repo, 'README.md', 'Other working heading\n');
  writeDemoIndexFile(repo, 'README.md', 'Other indexed heading\n');
  expect(hashes(repo, 1, 1)).toEqual([hashFor(1)]);
  for (const [start, end] of [
    [0, 1],
    [1.5, 2],
    [2, 1],
    [1, 5],
    [NaN, 1],
  ])
    expect(() => demoLineHistory(repo, 'README.md', start, end)).toThrow('line range');
  expect(() => demoLineHistory(repo, 'missing.txt', 1, 1)).toThrow('absent');
});
it('follows an exact rename and retains deleted lines inside a selected range, matching native Git', () => {
  const repo = new DemoRepository();
  const commit = (number: number, files: DemoFiles): DemoCommit => ({
    hash: hashFor(number),
    parent: number === 1 ? '' : hashFor(number - 1),
    subject: String(number),
    date: '2026-10-20T10:00:00Z',
    files,
  });
  repo.commits = [
    commit(4, { 'b.txt': 'one\nthree\n' }),
    commit(3, { 'b.txt': 'one\ntwo changed\nthree\n' }),
    commit(2, { 'b.txt': 'one\ntwo\nthree\n' }),
    commit(1, { 'a.txt': 'one\ntwo\nthree\n' }),
  ];
  expect(hashes(repo, 1, 2, 'b.txt')).toEqual([hashFor(4), hashFor(3), hashFor(1)]);
  expect(hashes(repo, 1, 1, 'b.txt')).toEqual([hashFor(1)]);
  expect(hashes(repo, 2, 2, 'b.txt')).toEqual([hashFor(1)]);
  repo.commits.unshift(commit(5, {}));
  repo.commits.unshift(commit(6, { 'b.txt': 'unrelated replacement\n' }));
  expect(hashes(repo, 1, 1, 'b.txt')).toEqual([hashFor(6)]);
});
