import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { DEMO_REPO } from './demoRepository';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchCarryRecipe, carryBranch, carryName } from '@/shared/tutorial/branchCarryHelpers';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { historyText } from './demoHistoryExamples';
import { resolveDemoCommit } from './demoHistory';
const create = (language: 'de' | 'en' = 'en') =>
  createDemoApi(
    { request: { chapterId: 'branches' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0], prepare: branchCarryRecipe() },
  );

it.each(['de', 'en'] as const)(
  'carries separately staged, working and untracked versions without committing or losing their contents (%s)',
  async (language) => {
    const { api, repo } = create(language);
    const before = structuredClone({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, commits: repo.commits });
    const inspected = await api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: carryBranch } });
    expect(inspected).toMatchObject({
      success: true,
      data: {
        sourceBranch: 'main',
        sourceHead: practiceCommitHash(4),
        targetSha: practiceCommitHash(4),
        files: [
          { path: 'README.md', index: 'M', worktree: 'M' },
          { path: 'notes.txt', index: '?', worktree: '?' },
        ],
      },
    });
    if (!inspected.success) throw Error(inspected.error);
    expect(
      await api.git.executeBranchChange({ repoPath: DEMO_REPO, planId: inspected.data.planId, mode: 'carry', name: carryName[language === 'de' ? 0 : 1] }),
    ).toMatchObject({ success: true, data: { switched: true, restored: true, conflicts: [] } });
    expect(repo.branch).toBe(carryBranch);
    expect(resolveDemoCommit(repo, 'main')?.hash).toBe(practiceCommitHash(4));
    expect({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, commits: repo.commits }).toEqual(before);
    expect([...repo.staged]).toEqual(['README.md']);
    expect([...repo.modified]).toEqual(['README.md']);
    expect([...repo.untracked]).toEqual(['notes.txt']);
    expect(repo.stashes).toHaveLength(0);
    for (const source of ['staged', 'unstaged'] as const) {
      const preview = await api.git.getDiffPreview(
        ['diff', ...(source === 'staged' ? ['--cached'] : []), '--', 'README.md'],
        { maxBytes: 5000, maxLines: 100 },
        DEMO_REPO,
      );
      expect(preview.success && preview.data.text).toContain('+' + historyText(source === 'staged' ? 'index' : 'work', language).split('\n')[2]);
      expect(preview.success && preview.data.text).toContain('-' + historyText(source === 'staged' ? 'latest' : 'index', language).split('\n')[2]);
    }
  },
);

it.each(['', '   ', 'bad\nname', 'bad\0name', 'x'.repeat(501)])('rejects an invalid backup name before changing branch or bytes (%j)', async (name) => {
  const { api, repo } = create();
  const plan = await api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: carryBranch } });
  if (!plan.success) throw Error(plan.error);
  const before = structuredClone({ files: repo.files, index: repo.indexFiles, revision: repo.revision });
  expect(await api.git.executeBranchChange({ repoPath: DEMO_REPO, planId: plan.data.planId, mode: 'carry', name })).toMatchObject({ success: false });
  expect(repo.branch).toBe('main');
  expect({ files: repo.files, index: repo.indexFiles, revision: repo.revision }).toEqual(before);
  expect(await api.git.executeBranchChange({ repoPath: DEMO_REPO, planId: plan.data.planId, mode: 'carry', name: 'Reviewed changes' })).toMatchObject({
    success: true,
  });
});

it('refuses an invalid mode without losing changes or preventing a subsequent supported carry', async () => {
  const { api, repo } = create();
  const plan = await api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: carryBranch } });
  if (!plan.success) throw Error(plan.error);
  const before = structuredClone({ files: repo.files, index: repo.indexFiles });
  expect(await api.git.executeBranchChange({ repoPath: DEMO_REPO, planId: plan.data.planId, mode: 'invalid' as 'carry', name: 'Practice' })).toMatchObject({
    success: false,
  });
  expect(repo.branch).toBe('main');
  expect({ files: repo.files, index: repo.indexFiles }).toEqual(before);
  expect(await api.git.executeBranchChange({ repoPath: DEMO_REPO, planId: plan.data.planId, mode: 'carry', name: 'Practice' })).toMatchObject({
    success: true,
  });
});
