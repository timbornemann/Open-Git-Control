import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { writeDemoFile } from './demoFiles';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';

const source = 'feature/begruessung';
const fixture = () =>
  createDemoApi(
    { request: { chapterId: 'conflicts' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'conflicts')!.steps[0],
  );
it('resets an unrelated tracked file staged after starting the merge', () => {
  const { repo } = fixture();
  const original = repo.headFiles['package.json'];
  writeDemoFile(repo, 'package.json', 'A newly staged edit\n');
  expect(repo.stage(['package.json']).success).toBe(true);
  expect(repo.command('mergeAbort').success).toBe(true);
  expect(repo.files['package.json']).toEqual(original);
  expect(repo.indexFiles).toEqual(repo.headFiles);
  expect(repo.status()).toBe('');
});
it('removes a new file that was explicitly staged during the merge', () => {
  const { repo } = fixture();
  writeDemoFile(repo, 'new-note.txt', 'An explicitly staged note\n');
  expect(repo.stage(['new-note.txt']).success).toBe(true);
  expect(repo.command('mergeAbort').success).toBe(true);
  expect(repo.files['new-note.txt']).toBeUndefined();
  expect(repo.indexFiles['new-note.txt']).toBeUndefined();
  expect(repo.status()).toBe('');
});
it('keeps new files that were never staged', () => {
  const { repo } = fixture();
  writeDemoFile(repo, 'new-note.txt', 'An untracked note\n');
  expect(repo.command('mergeAbort').success).toBe(true);
  expect(repo.files['new-note.txt']).toBe('An untracked note\n');
  expect(repo.status()).toBe('?? new-note.txt\n');
});
it('preserves a later unstaged draft after resolving with the unchanged current side', () => {
  const { repo } = fixture();
  expect(repo.command('conflictTakeOurs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  writeDemoFile(repo, 'README.md', 'A new unstaged draft\n');
  expect(repo.command('mergeAbort').success).toBe(true);
  expect(repo.files['README.md']).toBe('A new unstaged draft\n');
  expect(repo.status()).toBe(' M README.md\n');
});
it.each(['README.md', 'package.json'])('refuses an abort atomically when %s has both staged content and a later working draft', (path) => {
  const { repo } = fixture();
  if (path === 'README.md') {
    expect(repo.command('conflictTakeTheirs', path).success).toBe(true);
    expect(repo.command('conflictMarkResolved', path).success).toBe(true);
  } else {
    writeDemoFile(repo, path, 'A staged package edit\n');
    expect(repo.stage([path]).success).toBe(true);
  }
  writeDemoFile(repo, path, 'A later unstaged draft\n');
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('mergeAbort')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
it('protects a recreated working file after resolving a conflict by deletion', () => {
  const { repo } = fixture();
  expect(repo.command('conflictTakeDeleted', 'README.md').success).toBe(true);
  writeDemoFile(repo, 'README.md', 'A deliberately recreated file\n');
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('mergeAbort')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
it('can abort after renaming the active branch without undoing its new name', () => {
  const { repo } = fixture();
  expect(repo.command('branch', '-m', 'topic/renamed').success).toBe(true);
  expect(repo.command('mergeAbort')).toMatchObject({ success: true });
  expect(repo.branch).toBe('topic/renamed');
  expect(repo.branchHeads.get('topic/renamed')).toBe(hash(4));
  expect(repo.branchHeads.has('main')).toBe(false);
  expect(repo.branchHeads.get(source)).toBe(hash(5));
  expect(repo.status()).toBe('');
});
it.each(['mergeContinue', 'commit'] as const)('finishes on the renamed target with both original parents using %s', (action) => {
  const { repo } = fixture();
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  expect(repo.command('branch', '-m', 'topic/renamed').success).toBe(true);
  const result = action === 'commit' ? repo.commit('docs: save the resolution') : repo.command(action);
  expect(result).toMatchObject({ success: true });
  expect(repo.commits[0].parent).toBe(hash(4) + ' ' + hash(5));
  expect(repo.branchHeads.get('topic/renamed')).toBe(hash(6));
  expect(repo.status()).toBe('');
});
