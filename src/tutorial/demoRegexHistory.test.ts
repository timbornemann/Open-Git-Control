import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { DEMO_REPO, DEMO_SECOND_REPO, hashFor } from './demoRepository';
import { parseGitLog } from '@/utils/gitParsing';
import { matchDemoRegex } from './demoRegexEngine';
import * as worker from './demoRegexWorker';
import { writeDemoFile } from './demoFiles';
import type { IpcResult } from '@/types/ipc';
const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0];
const setup = () =>
  createDemoApi(
    { request: { chapterId: 'history' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    step,
  );
beforeEach(() => {
  vi.spyOn(worker, 'runDemoRegex').mockImplementation(async (_owner, request) => matchDemoRegex(request));
});
afterEach(() => vi.restoreAllMocks());
it.each([
  ['src/app.ts', 'Hallo', [4, 2]],
  ['src/app.ts', '"Hallo";$', [4, 2]],
  ['src/app.ts', '"Hallo Welt!";$', [4]],
  ['src/app.ts', 'hallo', []],
  ['README.md', '^Status:', [4]],
  ['README.md', '^$', [4, 3, 2, 1]],
  ['README.md', 'Project overview', [4, 3]],
] as const)('returns actual regex history for %s / %s', async (path, pattern, expected) => {
  const {
    api: { git },
    repo,
  } = setup();
  const snapshot = structuredClone({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, commits: repo.commits, revision: repo.revision });
  const result = await git.runGitCommandForRepo(DEMO_REPO, 'forensicHistory', 'regex', path, pattern, '0', '0', '200');
  expect(result.success && parseGitLog(result.data).map((commit) => commit.hash)).toEqual(expected.map(hashFor));
  expect({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, commits: repo.commits, revision: repo.revision }).toEqual(snapshot);
});
it('retains limits, absence, errors and repository authorization without running Git', async () => {
  const {
    api: { git },
  } = setup();
  const limited = await git.runGitCommand('forensicHistory', 'regex', 'src/app.ts', 'Hallo', '0', '0', '1');
  expect(limited.success && parseGitLog(limited.data).map((commit) => commit.hash)).toEqual([hashFor(4)]);
  expect(await git.runGitCommand('forensicHistory', 'regex', 'never-existed.txt', 'Hallo')).toEqual({ success: true, data: '' });
  const invalid = await git.runGitCommand('forensicHistory', 'regex', 'src/app.ts', '[');
  expect(invalid).toMatchObject({ success: false, error: expect.stringContaining('Invalid regular expression:') });
  vi.mocked(worker.runDemoRegex).mockClear();
  expect((await git.runGitCommandForRepo(DEMO_SECOND_REPO, 'forensicHistory', 'regex', 'src/app.ts', 'Hallo')).success).toBe(false);
  expect((await git.runGitCommand('forensicHistory', 'regex', '../src/app.ts', 'Hallo')).success).toBe(false);
  expect((await git.runGitCommand('forensicHistory', 'regex', 'src/app.ts', '')).success).toBe(false);
  expect(worker.runDemoRegex).not.toHaveBeenCalled();
});
it.each(['reset', 'commit', 'switch'] as const)('discards a worker result after practice state %s', async (change) => {
  let resolve!: (result: IpcResult<number[]>) => void;
  vi.mocked(worker.runDemoRegex).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const {
    api: { git },
    repo,
  } = setup();
  const pending = git.runGitCommand('forensicHistory', 'regex', 'src/app.ts', 'Hallo');
  if (change === 'reset') repo.reset(step, 'en');
  else if (change === 'switch') repo.selectProject(DEMO_SECOND_REPO);
  else {
    writeDemoFile(repo, 'README.md', 'New saved contents\n');
    repo.stage(['README.md']);
    repo.commit('Newer commit');
  }
  resolve({ success: true, data: [0] });
  expect(await pending).toMatchObject({ success: false, error: expect.stringContaining('practice state changed') });
});
