import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';
import { historyText } from './demoHistoryExamples';
const create = () => {
  const prepare = branchRecipe();
  prepare.branches = {
    fixture: 'diverged-readme',
    heads: [
      { name: 'main', commit: 4 },
      { name: 'feature/begruessung', commit: 5 },
    ],
    current: 'main',
  };
  const step = { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], prepare };
  const demo = createDemoApi(
    { request: { chapterId: 'cherry-pick' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    step,
  );
  return { ...demo, step };
};
function start() {
  const demo = create();
  expect(demo.repo.command('cherry-pick', hash(5)).success).toBe(false);
  expect(demo.repo.mergeState).toMatchObject({ operation: 'cherry-pick', sourceHash: hash(5), targetHash: hash(4), targetBranch: 'main' });
  return demo;
}
const resolve = (repo: ReturnType<typeof create>['repo'], side: 'ours' | 'theirs' = 'theirs') => {
  expect(repo.command(side === 'ours' ? 'conflictTakeOurs' : 'conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
};
it('starts a pending cherry-pick with real index sides while preserving HEAD and the source', async () => {
  const { repo, api } = start();
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(repo.branchHeads.get('main')).toBe(hash(4));
  expect(repo.branchHeads.get('feature/begruessung')).toBe(hash(5));
  expect(repo.status()).toBe('UU README.md\n');
  expect(repo.files['README.md']).toContain('<<<<<<< HEAD');
  expect(repo.mergeState!.conflicts.get('README.md')).toMatchObject({
    base: historyText('description', 'en'),
    ours: historyText('latest', 'en'),
    theirs: historyText('work', 'en'),
  });
  expect(repo.indexFiles['README.md']).toBe(repo.headFiles['README.md']);
  expect(repo.reflog[0].hash).toBe(hash(4));
  expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: 'cherry-pick' } });
});
it('keeps an unresolved operation pending and rejects commands for the wrong sequencer', () => {
  const { repo } = start(),
    before = demoRepositoryFingerprint(repo);
  for (const name of ['cherryPickContinue', 'mergeContinue', 'mergeAbort'] as const) expect(repo.command(name).success).toBe(false);
  expect(repo.command('cherryPickAbort', '--force').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
it('continues with one parent, the source metadata, and only its resolved patch', async () => {
  const { repo, api } = start(),
    source = structuredClone(resolveDemoCommit(repo, hash(5))!);
  const currentApp = repo.headFiles['src/app.ts'];
  resolve(repo);
  expect(repo.conflicted).toBe(false);
  expect(repo.mergeState).not.toBeNull();
  expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: 'cherry-pick' } });
  expect(repo.command('cherryPickContinue').success).toBe(true);
  expect(repo.commits[0]).toMatchObject({
    hash: hash(6),
    parent: hash(4),
    subject: source.subject,
    body: source.body,
    author: source.author,
    email: source.email,
    date: source.date,
  });
  expect(repo.headFiles['README.md']).toBe(source.files!['README.md']);
  expect(repo.headFiles['src/app.ts']).toBe(currentApp);
  expect(repo.branchHeads.get('main')).toBe(hash(6));
  expect(repo.branchHeads.get('feature/begruessung')).toBe(hash(5));
  expect(resolveDemoCommit(repo, hash(5))).toEqual(source);
  expect(repo.mergeState).toBeNull();
  expect(repo.status()).toBe('');
  expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: null } });
});
it.each([false, true])('aborts a pending cherry-pick with resolved=%s while preserving independent drafts', (resolved) => {
  const { repo } = start(),
    head = structuredClone(repo.headFiles),
    history = structuredClone(repo.reflog);
  writeDemoFile(repo, 'LICENSE', 'An independent tracked draft\n');
  writeDemoFile(repo, 'notes [ä].txt', 'An independent note\n');
  if (resolved) resolve(repo);
  expect(repo.command('cherryPickAbort').success).toBe(true);
  expect(repo.files).toEqual({ ...head, LICENSE: 'An independent tracked draft\n', 'notes [ä].txt': 'An independent note\n' });
  expect(repo.indexFiles).toEqual(head);
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(resolveDemoCommit(repo, hash(6))).toBeUndefined();
  expect(repo.mergeState).toBeNull();
  expect(repo.reflog[0].subject).toBe('reset: moving to ' + hash(4));
  expect(repo.reflog.slice(1)).toEqual(history);
});
it('leaves an empty resolution pending rather than inventing a commit', () => {
  const { repo } = start();
  resolve(repo, 'ours');
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('cherryPickContinue').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(repo.command('cherryPickAbort').success).toBe(true);
});
it('refuses to overwrite a later draft on a resolved path when aborting', () => {
  const { repo } = start();
  resolve(repo);
  writeDemoFile(repo, 'README.md', 'A later draft after resolving\n');
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('cherryPickAbort').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
it('can continue on the renamed active branch and refuses a changed HEAD', () => {
  const { repo } = start();
  expect(repo.command('branch', '-m', 'main', 'learning/renamed').success).toBe(true);
  resolve(repo);
  expect(repo.command('cherryPickContinue').success).toBe(true);
  expect(repo.branchHeads.get('learning/renamed')).toBe(hash(6));
  const other = start().repo;
  other.commits = [resolveDemoCommit(other, hash(3))!, ...other.commits.filter((commit) => commit.hash !== hash(3))];
  const before = demoRepositoryFingerprint(other);
  expect(other.command('cherryPickAbort').success).toBe(false);
  expect(demoRepositoryFingerprint(other)).toBe(before);
});
it('a regular resolved commit also keeps cherry-pick authorship and a single parent', () => {
  const { repo } = start(),
    source = resolveDemoCommit(repo, hash(5))!;
  resolve(repo);
  expect(repo.commit('docs: deliberately combine the greeting', { description: 'A chosen resolution.' }).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({ parent: hash(4), author: source.author, date: source.date, body: 'A chosen resolution.' });
  expect(repo.mergeState).toBeNull();
});
it('scopes pending sequencers to their project and clears them on a fresh lesson', () => {
  const { repo, step } = start();
  const pending = structuredClone(repo.mergeState);
  repo.selectProject(DEMO_SECOND_REPO);
  expect(repo.mergeState).toBeNull();
  repo.selectProject(DEMO_REPO);
  expect(repo.mergeState).toEqual(pending);
  repo.reset(step, 'en');
  expect(repo.mergeState).toBeNull();
  expect(repo.conflicted).toBe(false);
});
