import { expect, it } from 'vitest';
import { DemoRepository, DEMO_REPO } from './demoRepository';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { practiceCommitHash as id } from '@/shared/tutorial/exampleGitIds';
import { resolveDemoCommit } from './demoHistory';
import { writeDemoFile } from './demoFiles';
import { demoBlobText } from './demoBlob';
import { historyText } from './demoHistoryExamples';
import { createDemoGitApi } from './demoGitApi';
import { createDemoBranchApi } from './demoBranchApi';
import { parseGitLog } from '@/utils/gitParsing';
import { demoAnalytics } from './demoAnalytics';
const create = () => {
  const repo = new DemoRepository();
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  return repo;
};
const text = (repo: DemoRepository, path = 'README.md') => demoBlobText(repo.files[path]);
it('keeps explicitly requested branches strict when a missing branch name happens to be a commit ID', async () => {
  const repo = create(),
    api = createDemoBranchApi(repo);
  const before = structuredClone(repo.branchHeads);
  expect(await api.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: id(3) } })).toMatchObject({ success: false });
  expect(repo.branch).toBe('main');
  expect(repo.branchHeads).toEqual(before);
  expect(await api.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'detached', ref: id(3) } })).toMatchObject({
    success: true,
    data: { targetSha: id(3) },
  });
});
function commitOn(repo: DemoRepository, branch = 'feature/practice') {
  expect(repo.command('checkout', '-b', branch).success).toBe(true);
  writeDemoFile(repo, 'README.md', 'Saved on the practice branch\n');
  repo.stage(['README.md']);
  expect(repo.commit('docs: practice change').success).toBe(true);
  return repo.commits[0].hash;
}
it('keeps branch and remote references fixed while another branch receives a commit', () => {
  const repo = create();
  const changed = commitOn(repo);
  expect(resolveDemoCommit(repo, 'HEAD')?.hash).toBe(changed);
  expect(resolveDemoCommit(repo, 'feature/practice')?.hash).toBe(changed);
  expect(resolveDemoCommit(repo, 'main')?.hash).toBe(id(4));
  expect(resolveDemoCommit(repo, 'origin/main')?.hash).toBe(id(4));
  expect(repo.command('checkout', 'main').success).toBe(true);
  expect(repo.commits[0].hash).toBe(id(4));
  expect(text(repo)).toBe(historyText('latest', 'en'));
  expect(repo.staged.size + repo.modified.size + repo.untracked.size).toBe(0);
  expect(repo.command('show', changed + ':README.md')).toMatchObject({ success: true, data: 'Saved on the practice branch\n' });
});
it('creates a named reference at its requested revision without switching the working tree', () => {
  const repo = create();
  expect(repo.command('branch', 'feature/older', 'HEAD~1').success).toBe(true);
  expect(repo.branch).toBe('main');
  expect(resolveDemoCommit(repo, 'feature/older')?.hash).toBe(id(3));
  expect(text(repo)).toBe(historyText('latest', 'en'));
  expect(repo.command('checkout', 'feature/older').success).toBe(true);
  expect(repo.commits[0].hash).toBe(id(3));
  expect(text(repo)).toBe(historyText('description', 'en'));
  expect(demoBlobText(repo.indexFiles['README.md'])).toBe(text(repo));
  expect(demoBlobText(repo.headFiles['README.md'])).toBe(text(repo));
  expect(parseGitLog(repo.log()).map((commit) => commit.hash)).toEqual([id(4), id(3), id(2), id(1)]);
  expect(demoAnalytics(repo).refs.find((ref) => ref.name === 'main')?.oid).toBe(id(4));
  expect(demoAnalytics(repo).refs.find((ref) => ref.name === 'feature/older')?.oid).toBe(id(3));
});
it('does not invent a branch or change files when a reference is missing or duplicated', () => {
  const repo = create();
  const before = structuredClone({ branches: repo.branches, files: repo.files, revision: repo.revision });
  expect(repo.command('checkout', 'missing').success).toBe(false);
  expect(repo.command('checkout', '-b', 'main').success).toBe(false);
  expect(repo.command('branch', 'main').success).toBe(false);
  expect(repo.command('branch', 'unknown-base', 'missing').success).toBe(false);
  expect({ branches: repo.branches, files: repo.files, revision: repo.revision }).toEqual(before);
});
it.each(['-option', 'HEAD', 'feature..broken', 'topic/.hidden', 'topic/one.lock', 'topic space'])(
  'rejects the invalid branch name %s without mutation',
  (name) => {
    const repo = create();
    expect(repo.command('checkout', '-b', name).success).toBe(false);
    expect(repo.branch).toBe('main');
    expect(repo.branches).not.toContain(name);
    expect(repo.commits[0].hash).toBe(id(4));
  },
);
it('rejects file/directory reference collisions in either direction', () => {
  const repo = create();
  expect(repo.command('branch', 'topic').success).toBe(true);
  expect(repo.command('branch', 'topic/child').success).toBe(false);
  expect(repo.command('branch', 'feature').success).toBe(false);
  expect(resolveDemoCommit(repo, 'topic')?.hash).toBe(id(4));
});
it('renames the active branch and its reference without changing files or commits', () => {
  const repo = create();
  const changed = commitOn(repo);
  expect(repo.command('branch', '-m', 'feature/practice', 'feature/renamed').success).toBe(true);
  expect(repo.branch).toBe('feature/renamed');
  expect(resolveDemoCommit(repo, 'feature/renamed')?.hash).toBe(changed);
  expect(resolveDemoCommit(repo, 'feature/practice')).toBeUndefined();
  expect(text(repo)).toBe('Saved on the practice branch\n');
  expect(repo.command('branch', '-m', 'feature/renamed', 'main').success).toBe(false);
  expect(repo.branch).toBe('feature/renamed');
});
it('protects primary and checked-out branches, even from forced deletion', () => {
  const repo = create();
  repo.command('checkout', '-b', 'feature/practice');
  expect(repo.command('branch', '-D', 'main')).toMatchObject({ success: false, error: expect.stringContaining('[PROTECTED_BRANCH]') });
  expect(repo.command('branch', '-D', 'feature/practice').success).toBe(false);
  expect(repo.branches).toContain('main');
  expect(repo.branches).toContain('feature/practice');
});
it('requires explicit force for unmerged commits and keeps their objects available for recovery', async () => {
  const repo = create();
  const changed = commitOn(repo);
  repo.command('checkout', 'main');
  expect(repo.command('branch', '-d', 'feature/practice')).toMatchObject({ success: false, error: expect.stringMatching(/not fully merged/i) });
  expect(repo.command('branch', '-D', 'feature/practice').success).toBe(true);
  expect(repo.branches).not.toContain('feature/practice');
  expect(resolveDemoCommit(repo, changed)?.hash).toBe(changed);
  const result = await createDemoGitApi(repo).getCommitLogPage!({ repoPath: DEMO_REPO, scope: 'all', limit: 200, offset: 0 });
  expect(result.success && result.data.raw.includes(changed)).toBe(false);
});
it('safely deletes a merged inactive reference and leaves other references intact', () => {
  const repo = create();
  repo.command('branch', 'feature/finished', 'HEAD~1');
  expect(repo.command('branch', '-d', 'feature/finished').success).toBe(true);
  expect(resolveDemoCommit(repo, 'feature/finished')).toBeUndefined();
  expect(resolveDemoCommit(repo, 'main')?.hash).toBe(id(4));
  expect(resolveDemoCommit(repo, 'origin/main')?.hash).toBe(id(4));
});
it('carries independent staged and working changes while updating the target tree', () => {
  const repo = create();
  repo.command('branch', 'feature/older', 'HEAD~1');
  writeDemoFile(repo, 'LICENSE', 'Staged local note\n');
  repo.stage(['LICENSE']);
  writeDemoFile(repo, 'LICENSE', 'Unstaged local note\n');
  expect(repo.command('checkout', 'feature/older').success).toBe(true);
  expect(text(repo)).toBe(historyText('description', 'en'));
  expect(demoBlobText(repo.indexFiles.LICENSE)).toBe('Staged local note\n');
  expect(text(repo, 'LICENSE')).toBe('Unstaged local note\n');
  expect(repo.staged.has('LICENSE')).toBe(true);
  expect(repo.modified.has('LICENSE')).toBe(true);
});
it('refuses an overlapping local edit before changing any branch, index or file', () => {
  const repo = create();
  repo.command('branch', 'feature/older', 'HEAD~1');
  writeDemoFile(repo, 'README.md', 'Keep my unfinished edit\n');
  const before = structuredClone({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, revision: repo.revision });
  expect(repo.command('checkout', 'feature/older').success).toBe(false);
  expect(repo.branch).toBe('main');
  expect({ files: repo.files, index: repo.indexFiles, head: repo.headFiles, revision: repo.revision }).toEqual(before);
});
it('preserves untracked files and refuses to overwrite an untracked target path', () => {
  const repo = create();
  repo.command('checkout', '-b', 'feature/new-file');
  writeDemoFile(repo, 'future.txt', 'Saved branch file\n');
  repo.stage(['future.txt']);
  repo.commit('docs: add future file');
  expect(repo.command('checkout', 'main').success).toBe(true);
  expect(repo.files['future.txt']).toBeUndefined();
  writeDemoFile(repo, 'future.txt', 'Keep my new local file\n');
  expect(repo.command('checkout', 'feature/new-file').success).toBe(false);
  expect(repo.branch).toBe('main');
  expect(text(repo, 'future.txt')).toBe('Keep my new local file\n');
  expect(repo.untracked.has('future.txt')).toBe(true);
});
it.each(['future', 'future/item.txt/child', 'FUTURE/ITEM.TXT'])('protects an untracked checkout path collision at %s', (path) => {
  const repo = create();
  repo.command('checkout', '-b', 'feature/directory');
  writeDemoFile(repo, 'future/item.txt', 'Saved branch file\n');
  repo.stage(['future/item.txt']);
  repo.commit('docs: add branch file');
  repo.command('checkout', 'main');
  writeDemoFile(repo, path, 'Keep this untracked file\n');
  const before = structuredClone({ files: repo.files, index: repo.indexFiles, revision: repo.revision });
  expect(repo.command('checkout', 'feature/directory').success).toBe(false);
  expect(repo.branch).toBe('main');
  expect({ files: repo.files, index: repo.indexFiles, revision: repo.revision }).toEqual(before);
});
it('does not imply an upstream for a branch created only locally', async () => {
  const repo = create();
  const api = createDemoGitApi(repo);
  repo.command('checkout', '-b', 'feature/local');
  const result = await api.runGitCommand!('status');
  expect(result.success && result.data).not.toContain('branch.upstream');
});
it('keeps branch references with their own simulated repository and resets fresh entries', () => {
  const repo = create();
  const changed = commitOn(repo);
  repo.registerProject('/tutorial/other', { 'other.txt': 'Other sample\n' }, true);
  repo.selectProject('/tutorial/other');
  expect(resolveDemoCommit(repo, 'feature/practice')).toBeUndefined();
  repo.selectProject(DEMO_REPO);
  expect(repo.branch).toBe('feature/practice');
  expect(resolveDemoCommit(repo, 'main')?.hash).toBe(id(4));
  expect(resolveDemoCommit(repo, 'feature/practice')?.hash).toBe(changed);
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  expect(repo.branches).not.toContain('feature/practice');
  expect(resolveDemoCommit(repo, 'main')?.hash).toBe(id(4));
});

it('keeps a branch-change plan valid across harmless background hosting reads', async () => {
  const repo = create(),
    api = createDemoBranchApi(repo);
  const inspected = await api.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: 'feature/begruessung' } });
  if (!inspected.success) throw new Error(inspected.error);
  repo.mark('hosting-inspected');
  expect(await api.executeBranchChange({ repoPath: DEMO_REPO, planId: inspected.data.planId, mode: 'carry', name: 'Practice' })).toMatchObject({
    success: true,
  });
  expect(repo.branch).toBe('feature/begruessung');
});
it('binds branch-change inspections to the actual target revision and active repository', async () => {
  const repo = create(),
    api = createDemoBranchApi(repo);
  repo.command('branch', 'feature/older', 'HEAD~1');
  const inspected = await api.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: 'feature/older' } });
  expect(inspected).toMatchObject({ success: true, data: { sourceBranch: 'main', sourceHead: id(4), targetSha: id(3), files: [] } });
  expect(await api.inspectBranchChange({ repoPath: '/tutorial/other', target: { kind: 'existing', branch: 'main' } })).toMatchObject({ success: false });
});
it.each(['mutated', 'cancelled', 'reset'] as const)('rejects a %s branch-change plan without a checkout', async (reason) => {
  const repo = create(),
    api = createDemoBranchApi(repo);
  const inspected = await api.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'create', branch: 'feature/planned', startPoint: 'HEAD' } });
  if (!inspected.success) throw new Error(inspected.error);
  if (reason === 'mutated') writeDemoFile(repo, 'README.md', 'Unfinished local note\n');
  if (reason === 'cancelled') await api.cancelBranchChange(DEMO_REPO);
  if (reason === 'reset') repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  expect(await api.executeBranchChange({ repoPath: DEMO_REPO, planId: inspected.data.planId, mode: 'carry', name: 'Practice' })).toMatchObject({
    success: false,
  });
  expect(repo.branch).toBe('main');
  expect(repo.branches).not.toContain('feature/planned');
});
it('executes a fresh plan once and refuses a replay or foreign-repository execution', async () => {
  const repo = create(),
    api = createDemoBranchApi(repo);
  const inspected = await api.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'create', branch: 'feature/planned', startPoint: 'HEAD' } });
  if (!inspected.success) throw new Error(inspected.error);
  const request = { repoPath: DEMO_REPO, planId: inspected.data.planId, mode: 'carry' as const, name: 'Practice' };
  expect(await api.executeBranchChange({ ...request, repoPath: '/tutorial/other' })).toMatchObject({ success: false });
  expect(repo.branch).toBe('main');
  expect(await api.executeBranchChange(request)).toMatchObject({ success: true, data: { switched: true, restored: true, conflicts: [] } });
  expect(repo.branch).toBe('feature/planned');
  expect(await api.executeBranchChange(request)).toMatchObject({ success: false });
});
