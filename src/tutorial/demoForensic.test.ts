import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { DEMO_REPO, DEMO_SECOND_REPO, hashFor } from './demoRepository';
import { parseGitLog } from '@/utils/gitParsing';
import { writeDemoFile, writeDemoIndexFile } from './demoFiles';
const setup = () =>
  createDemoApi(
    { request: { chapterId: 'history' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0],
  );
it('finds both introduction and removal of a literal, matching the isolated native Git comparison', async () => {
  const {
    api: { git },
  } = setup();
  const result = await git.runGitCommandForRepo(DEMO_REPO, 'forensicHistory', 'string', 'README.md', 'Project overview', '0', '0', '200');
  expect(result.success && parseGitLog(result.data).map((commit) => commit.hash)).toEqual([hashFor(4), hashFor(3)]);
  const removed = await git.runGitCommand('forensicHistory', 'string', 'README.md', 'A small example project.');
  expect(removed.success && parseGitLog(removed.data).map((commit) => commit.hash)).toEqual([hashFor(3), hashFor(2)]);
  const heading = await git.runGitCommand('forensicHistory', 'string', 'README.md', '# OGC-Lernprojekt');
  expect(heading.success && parseGitLog(heading.data).map((commit) => commit.hash)).toEqual([hashFor(1)]);
});
it('searches literal occurrence counts rather than every changed line or the worktree/index', async () => {
  const {
    api: { git },
    repo,
  } = setup();
  writeDemoFile(repo, 'src/app.ts', 'working-only needle\n');
  writeDemoIndexFile(repo, 'src/app.ts', 'indexed-only needle\n');
  const baseline = structuredClone({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, commits: repo.commits, revision: repo.revision });
  const result = await git.runGitCommand('forensicHistory', 'string', 'src/app.ts', 'Hallo');
  expect(result.success && parseGitLog(result.data).map((commit) => commit.hash)).toEqual([hashFor(2)]);
  expect(await git.runGitCommand('forensicHistory', 'string', 'src/app.ts', 'needle')).toEqual({ success: true, data: '' });
  expect({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, commits: repo.commits, revision: repo.revision }).toEqual(baseline);
});
it('limits results and rejects invalid paths, empty terms, foreign repositories and unsupported variants', async () => {
  const {
    api: { git },
  } = setup();
  const result = await git.runGitCommand('forensicHistory', 'string', 'README.md', 'Project overview', '0', '0', '1');
  expect(result.success && parseGitLog(result.data).map((commit) => commit.hash)).toEqual([hashFor(4)]);
  expect(await git.runGitCommand('forensicHistory', 'string', 'never-existed.txt', 'text')).toEqual({ success: true, data: '' });
  for (const args of [
    ['string', '../README.md', 'text'],
    ['string', '.git/config', 'text'],
    ['string', 'README.md', ''],
    ['string', 'README.md', 'text', '0', '0', '0'],
    ['unknown', 'README.md', '^Status:'],
  ])
    expect((await git.runGitCommand('forensicHistory', ...args)).success).toBe(false);
  expect((await git.runGitCommandForRepo(DEMO_SECOND_REPO, 'forensicHistory', 'string', 'README.md', 'Project overview')).success).toBe(false);
});
it('accepts the native line-range request shape and reports invalid ranges without a regex failure', async () => {
  const {
    api: { git },
  } = setup();
  const result = await git.runGitCommand('forensicHistory', 'line', 'README.md', 'line-range', '3', '3', '200');
  expect(result.success && parseGitLog(result.data).map((commit) => commit.hash)).toEqual([hashFor(4), hashFor(3), hashFor(2)]);
  const invalid = await git.runGitCommand('forensicHistory', 'line', 'README.md', 'line-range', '1.5', '2', '200');
  expect(invalid).toMatchObject({ success: false, error: expect.stringContaining('Invalid line range') });
});
