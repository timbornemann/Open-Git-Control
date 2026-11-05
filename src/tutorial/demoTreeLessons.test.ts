import { describe, expect, it } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { treeSeed, treeState, treeStates, treePaths as path, type TreeLessonState } from '@/shared/tutorial/treeLessonStates';
import type { TutorialCompletion, TutorialLaunchContext, TutorialStep } from '@/shared/tutorial/types';
import { createDemoApi } from './demoApi';
import { DEMO_REPO } from './demoRepository';
import { treeText } from './demoTreeExamples';
import { matchesTutorialWorkingTree } from './matchesTutorialWorkingTree';

const setup = (state: TreeLessonState = 'base', language: 'de' | 'en' = 'en') => {
  const context: TutorialLaunchContext = {
    request: { chapterId: 'tree-create' },
    language,
    theme: 'copper-night',
    progress: { version: 1, welcomeSeen: true, completedChapters: [] },
  };
  const step: TutorialStep = { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'tree-create')!.steps[0], prepare: treeSeed(state) };
  return createDemoApi(context, step);
};
const workingRule = (rule: TutorialCompletion | undefined): Extract<TutorialCompletion, { kind: 'working-tree' }> | undefined =>
  rule?.kind === 'all' ? rule.conditions.map(workingRule).find(Boolean) : rule?.kind === 'working-tree' ? rule : undefined;
function completed(repo: ReturnType<typeof setup>['repo'], chapter: string, step: string) {
  const rule = workingRule(TUTORIAL_CHAPTERS.find((entry) => entry.id === chapter)!.steps.find((entry) => entry.id === step)!.completion);
  expect(rule, chapter + '/' + step).toBeDefined();
  expect(matchesTutorialWorkingTree(repo, rule!, 'en'), chapter + '/' + step).toBe(true);
}

describe('reproducible working-directory lessons', () => {
  it.each(['de', 'en'] as const)('restores every independent state with original index and localized contents in %s', (language) => {
    for (const state of Object.keys(treeStates) as TreeLessonState[]) {
      const { repo } = setup(state, language);
      expect(matchesTutorialWorkingTree(repo, treeState(state) as Extract<TutorialCompletion, { kind: 'working-tree' }>, language), state).toBe(true);
      expect(repo.indexFiles[path.note]).toBe(treeText('note', language));
      expect(repo.headFiles).toEqual(repo.indexFiles);
      expect([...repo.directories].some((dir) => dir === 'practice')).toBe(!['renamed-folder', 'deleted-folder'].includes(state));
      expect(repo.directories.has('scratch')).toBe(['empty-folder', 'new-empty', 'new-saved'].includes(state));
      expect(repo.events.size).toBe(0);
    }
  });
  it('recognizes actual creation and CAS save without staging the new file', async () => {
    const {
      repo,
      api: { git },
    } = setup();
    expect((await git.createWorkingDirectoryFolder('scratch', DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-create', 'create-folder');
    expect((await git.createWorkingDirectoryFile(path.created, DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-create', 'create-file');
    const request = { repoPath: DEMO_REPO, path: path.created, source: 'unstaged' as const };
    const preview = await git.getRepositoryFilePreview(request);
    if (!preview.success) throw new Error(preview.error);
    expect(
      (await git.saveRepositoryFile({ ...request, expectedVersion: preview.data.version, encoding: 'utf8', content: treeText('created', 'en') })).success,
    ).toBe(true);
    completed(repo, 'tree-create', 'save');
  });
  it('preserves the renamed filename when its parent is renamed next', async () => {
    const {
      repo,
      api: { git },
    } = setup();
    expect((await git.moveWorkingDirectoryEntry(path.note, path.other, false, DEMO_REPO)).success).toBe(false);
    completed(repo, 'tree-rename', 'collision-submit');
    expect((await git.moveWorkingDirectoryEntry(path.note, path.renamed, false, DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-rename', 'rename-file');
    expect((await git.moveWorkingDirectoryEntry('practice', 'workbench', false, DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-rename', 'rename-folder');
    expect(repo.files['workbench/updated.md']).toBe(treeText('note', 'en'));
    expect(repo.directories.has('practice')).toBe(false);
  });
  it('keeps both original copies when replacing only the selected destination with the variant', async () => {
    const {
      repo,
      api: { git },
    } = setup();
    expect((await git.copyWorkingDirectoryEntry(path.note, path.copy, false, DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-copy', 'paste');
    expect((await git.copyWorkingDirectoryEntry(path.note, path.copy, false, DEMO_REPO)).success).toBe(false);
    completed(repo, 'tree-copy', 'cancel');
    expect((await git.copyWorkingDirectoryEntry(path.note, path.both, false, DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-copy', 'keep-both');
    expect((await git.copyWorkingDirectoryEntry(path.variant, path.copy, true, DEMO_REPO)).success).toBe(true);
    completed(repo, 'tree-replace', 'replace');
    expect(repo.files[path.both]).toBe(treeText('note', 'en'));
    expect(repo.files[path.copy]).toBe(treeText('other', 'en'));
  });
  it('recognizes moving and then independently deleting file/folder with saved Git versions intact', async () => {
    const moved = setup();
    expect((await moved.api.git.moveWorkingDirectoryEntry(path.note, path.copy, false, DEMO_REPO)).success).toBe(true);
    completed(moved.repo, 'tree-move', 'paste');
    const removed = setup();
    expect((await removed.api.git.deleteWorkingDirectoryEntry(path.note, DEMO_REPO)).success).toBe(true);
    completed(removed.repo, 'tree-delete', 'delete-file');
    expect((await removed.api.git.deleteWorkingDirectoryEntry('practice', DEMO_REPO)).success).toBe(true);
    completed(removed.repo, 'tree-delete', 'delete-folder');
    expect(removed.repo.directories.has('practice')).toBe(false);
    expect(removed.repo.indexFiles[path.note]).toBe(treeText('note', 'en'));
    expect(removed.repo.indexFiles[path.other]).toBe(treeText('other', 'en'));
    expect(setup().repo.status()).toBe('');
  });
});
