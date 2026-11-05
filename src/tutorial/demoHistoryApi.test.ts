import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import { DEMO_REPO, DEMO_SECOND_REPO, hashFor } from './demoRepository';
import { parseGitLog, parseCommitDetails } from '@/utils/gitParsing';
import { writeDemoFile, writeDemoIndexFile } from './demoFiles';
import { demoBlobText } from './demoBlob';
const context: TutorialLaunchContext = {
  request: { chapterId: 'files-navigation' },
  language: 'en',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const setup = () => createDemoApi(context, TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'files-navigation')!.steps[0]);
it('paginates real graph records with author metadata and matching commit statistics', async () => {
  const {
    api: { git },
    repo,
  } = setup();
  const first = await git.getCommitLogPage({ repoPath: DEMO_REPO, limit: 2, offset: 0, scope: 'all' });
  expect(first).toMatchObject({ success: true, data: { hasMore: true, stats: { [hashFor(4)]: { files: 2, additions: 2, deletions: 4 } } } });
  if (!first.success) throw new Error(first.error);
  const entries = parseGitLog(first.data.raw);
  expect(entries.map((entry) => entry.hash)).toEqual([hashFor(4), hashFor(3)]);
  expect(new Set(entries.map((entry) => entry.abbrevHash)).size).toBe(2);
  const second = await git.getCommitLogPage({ repoPath: DEMO_REPO, limit: 2, offset: 2, scope: 'head' });
  if (!second.success) throw new Error(second.error);
  expect(second.data.hasMore).toBe(false);
  expect(parseGitLog(second.data.raw).map((entry) => [entry.hash, entry.author])).toEqual([
    [hashFor(2), 'Sam Beispiel'],
    [hashFor(1), 'Sam Beispiel'],
  ]);
  expect(await git.requestCommitStats([hashFor(4)], 'selected', DEMO_REPO)).toMatchObject({
    success: true,
    data: { [hashFor(4)]: { state: 'ready', stats: first.data.stats[hashFor(4)] } },
  });
  expect(repo.headFiles).toEqual(repo.commits[0].files);
});
it('serves historical contents, file changes and parent diffs from the selected revision', async () => {
  const {
    api: { git },
    repo,
  } = setup();
  const root = await git.runGitCommand('commitDetails', hashFor(1));
  expect(
    root.success &&
      parseCommitDetails(root.data)
        .map((file) => file.path)
        .sort(),
  ).toEqual(['LICENSE', 'README.md']);
  const app = await git.runGitCommand('commitDetails', hashFor(2));
  expect(
    app.success &&
      parseCommitDetails(app.data)
        .map((file) => file.path)
        .sort(),
  ).toEqual(['README.md', 'package.json', 'src/app.ts']);
  expect(await git.runGitCommand('show', '-s', '--format=%H', hashFor(2))).toEqual({ success: true, data: hashFor(2) });
  expect(await git.runGitCommand('show', hashFor(2) + ':src/app.ts')).toEqual({ success: true, data: 'export const greeting = "Hallo";\n' });
  const preview = await git.getRepositoryFilePreview({ repoPath: DEMO_REPO, path: 'README.md', source: 'commit', commitHash: hashFor(2) });
  expect(preview).toMatchObject({ success: true, data: { text: '# OGC-Lernprojekt\n\nA small example project.\n', editable: false } });
  const diff = await git.getDiffPreview([hashFor(4) + '^', hashFor(4), '--', 'src/app.ts']);
  expect(diff.success && diff.data.text).toContain('-export const greeting = "Hallo";');
  expect(diff.success && diff.data.text).toContain('+export const greeting = "Hallo Welt!";');
  expect(repo.files['src/app.ts']).toBe('export const greeting = "Hallo Welt!";\n');
  expect((await git.runGitCommand('show', '-s', '--format=%B', 'missing')).success).toBe(false);
});
it('serves the actual commit viewer show request against the parent, even with a clean working tree', async () => {
  const {
    api: { git },
  } = setup();
  const latest = await git.getDiffPreview(['show', '--format=', '--binary', hashFor(4), '--', 'README.md'], {}, DEMO_REPO);
  expect(latest.success && latest.data.text).toContain('-Project overview');
  expect(latest.success && latest.data.text).toContain('+Status: Draft');
  const first = await git.getDiffPreview(['show', '--format=', '--binary', hashFor(1), '--', 'README.md'], {}, DEMO_REPO);
  expect(first.success && first.data.text).toContain('+# OGC-Lernprojekt');
  expect(first.success && first.data.text).not.toContain('-Project overview');
  expect((await git.getDiffPreview(['show', '--format=', 'missing', '--', 'README.md'], {}, DEMO_REPO)).success).toBe(false);
});
it('returns per-file history and the same first/latest history in file information', async () => {
  const {
    api: { git },
  } = setup();
  const source = await git.getFileHistory('src/app.ts', undefined, 80, DEMO_REPO);
  expect(source.success && source.data.map((entry) => entry.hash)).toEqual([hashFor(4), hashFor(2)]);
  const license = await git.getFileHistory('LICENSE', undefined, 80, DEMO_REPO);
  expect(license.success && license.data.map((entry) => entry.hash)).toEqual([hashFor(1)]);
  const info = await git.getWorkingDirectoryFileInfo('LICENSE', DEMO_REPO);
  expect(info).toMatchObject({
    success: true,
    data: { git: { historyCount: 1, firstCommit: { hash: hashFor(1), author: 'Sam Beispiel' }, latestCommit: { hash: hashFor(1) } } },
  });
  expect(await git.getFileHistory('notes-not-created.txt', undefined, 80, DEMO_REPO)).toEqual({ success: true, data: [] });
});
it('keeps commit/index/worktree blame distinct, with accurate ranged line numbers', async () => {
  const {
    api: { git },
    repo,
  } = setup();
  const original = demoBlobText(repo.files['README.md'])!;
  writeDemoFile(repo, 'README.md', original + 'Working note\n');
  writeDemoIndexFile(repo, 'README.md', original + 'Indexed note\n');
  const work = await git.getFileBlameRange('README.md', undefined, 3, 2, DEMO_REPO, 'unstaged');
  expect(work).toMatchObject({
    success: true,
    data: [
      { lineNumber: 3, commitHash: hashFor(4) },
      { lineNumber: 4, commitHash: '0'.repeat(40), content: 'Working note' },
    ],
  });
  const index = await git.getFileBlame('README.md', undefined, DEMO_REPO, 'staged');
  expect(index.success && index.data.at(-1)?.content).toBe('Indexed note');
  const historical = await git.getFileBlame('README.md', hashFor(2), DEMO_REPO);
  expect(historical.success && historical.data.at(-1)).toMatchObject({ lineNumber: 3, content: 'A small example project.', commitHash: hashFor(2) });
  writeDemoFile(repo, 'untracked.txt', 'New file\n');
  expect(await git.getFileBlame('untracked.txt', undefined, DEMO_REPO)).toMatchObject({ success: false, error: expect.stringContaining('no saved commit') });
});
it('reports actual timeline changes and baseline file sets, bounded by a selected commit', async () => {
  const {
    api: { git },
  } = setup();
  const timeline = await git.getFileTimelineData(100, DEMO_REPO, hashFor(2));
  expect(timeline).toMatchObject({
    success: true,
    data: [
      { hash: hashFor(2), changes: expect.arrayContaining([{ status: 'added', path: 'src/app.ts' }]), baselineFiles: expect.arrayContaining(['src/app.ts']) },
      { hash: hashFor(1), baselineFiles: ['README.md', 'LICENSE'] },
    ],
  });
});
it('rejects foreign repositories, unknown commits and invalid blame ranges without mutations', async () => {
  const {
    api: { git },
    repo,
  } = setup();
  const before = structuredClone({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, revision: repo.revision });
  const requests = [
    git.getCommitLogPage({ repoPath: DEMO_SECOND_REPO, limit: 100, offset: 0, scope: 'all' }),
    git.requestCommitStats([hashFor(4)], 'selected', DEMO_SECOND_REPO),
    git.getFileHistory('README.md', undefined, 80, DEMO_SECOND_REPO),
    git.getFileHistory('README.md', 'missing', 80, DEMO_REPO),
    git.getFileBlame('README.md', undefined, DEMO_SECOND_REPO),
    git.getFileBlameRange('README.md', undefined, 0, 2, DEMO_REPO),
    git.getFileTimelineData(100, DEMO_SECOND_REPO),
    git.getDiffPreview([hashFor(4) + '^', hashFor(4), '--', 'README.md'], undefined, DEMO_SECOND_REPO),
  ];
  for (const result of await Promise.all(requests)) expect(result.success).toBe(false);
  expect({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, revision: repo.revision }).toEqual(before);
});
