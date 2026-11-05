import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';
import { resolveDemoCommit } from './demoHistory';
import { parseGitLog } from '@/utils/gitParsing';
const create = () => {
  const prepare = branchRecipe();
  prepare.branches = {
    heads: [
      { name: 'main', commit: 4 },
      { name: 'feature/begruessung', commit: 1 },
    ],
    remotes: [{ name: 'origin/main', commit: 2 }],
    current: 'main',
  };
  return createDemoApi(
    { request: { chapterId: 'history' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], prepare },
  );
};
const request = (commitHash = hash(3)) => ({
  repoPath: DEMO_REPO,
  commitHash,
  expectedHead: hash(4),
  expectedBranch: 'refs/heads/main',
  operationId: crypto.randomUUID(),
  title: 'docs: clarify the learning project',
  description: 'A deliberate correction.\n\n# Keep this paragraph.',
});

it('inspects a clean unpublished older commit and the complete following range', async () => {
  const { api, repo, unsupported } = create();
  const before = demoRepositoryFingerprint(repo);
  expect(await api.git.inspectCommitMessageEdit({ repoPath: DEMO_REPO, commitHash: hash(3) })).toMatchObject({
    success: true,
    data: { commitHash: hash(3), expectedHead: hash(4), expectedBranch: 'refs/heads/main', commitCount: 2, signedCommitCount: 0, blockReason: null },
  });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect([...unsupported]).toEqual([]);
});

it('rewords the selected commit and its descendants while retaining every tree, author and date', async () => {
  const { api, repo } = create(),
    before = structuredClone(repo.commits),
    input = request();
  const working = structuredClone(repo.files),
    index = structuredClone(repo.indexFiles);
  const result = await api.git.rewordCommitMessage(input);
  expect(result).toMatchObject({
    success: true,
    data: { changed: true, oldHead: hash(4), newHead: hash(6), hashMapping: { [hash(3)]: hash(5), [hash(4)]: hash(6) } },
  });
  if (!result.success) throw new Error(result.error);
  expect(resolveDemoCommit(repo, hash(5))).toMatchObject({
    ...before.find((commit) => commit.hash === hash(3)),
    hash: hash(5),
    subject: input.title,
    body: input.description,
  });
  expect(resolveDemoCommit(repo, hash(6))).toMatchObject({ ...before.find((commit) => commit.hash === hash(4)), hash: hash(6), parent: hash(5) });
  expect(repo.files).toEqual(working);
  expect(repo.indexFiles).toEqual(index);
  expect(repo.status()).toBe('');
  expect(repo.branchHeads.get('main')).toBe(hash(6));
  expect(repo.remoteHeads.get('origin/main')).toBe(hash(2));
  expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
  const log = await api.git.getCommitLogPage({ repoPath: DEMO_REPO, scope: 'all', offset: 0, limit: 100 });
  expect(log.success && parseGitLog(log.data.raw).map((commit) => commit.hash)).toEqual([hash(6), hash(5), hash(2), hash(1)]);
  const backups = await api.git.getCommitMessageEditBackups(DEMO_REPO);
  expect(backups).toMatchObject({ success: true, data: [{ ref: result.data.backupRef, hash: hash(4), branch: 'refs/heads/main' }] });
  if (backups.success) backups.data[0].hash = 'changed by caller';
  expect(await api.git.getCommitMessageEditBackups(DEMO_REPO)).toMatchObject({ success: true, data: [{ hash: hash(4) }] });
  expect(resolveDemoCommit(repo, result.data.backupRef!)?.hash).toBe(hash(4));
});

it('does not rewrite unchanged messages or create a backup', async () => {
  const { api, repo } = create(),
    commit = repo.commits.find((commit) => commit.hash === hash(3))!,
    before = demoRepositoryFingerprint(repo);
  expect(await api.git.rewordCommitMessage({ ...request(), title: commit.subject, description: commit.body! })).toMatchObject({
    success: true,
    data: { changed: false, newHead: hash(4), hashMapping: {}, backupRef: null },
  });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(await api.git.getCommitMessageEditBackups(DEMO_REPO)).toMatchObject({ success: true, data: [] });
});

it.each(['published', 'referenced', 'dirty', 'detached', 'operation'] as const)('reports %s and refuses mutation without a partial rewrite', async (reason) => {
  const { api, repo } = create();
  if (reason === 'published') repo.remoteHeads.set('origin/main', hash(4));
  if (reason === 'referenced') repo.command('tag', 'protected-target', hash(3));
  if (reason === 'dirty') writeDemoFile(repo, 'LICENSE', 'An unfinished draft\n');
  if (reason === 'detached') repo.command('checkout', '--detach', hash(4));
  if (reason === 'operation')
    repo.mergeState = {
      mode: 'default',
      source: 'feature/begruessung',
      sourceHash: hash(1),
      targetHash: hash(4),
      targetBranch: 'main',
      originalIndex: structuredClone(repo.indexFiles),
      conflicts: new Map(),
    };
  const before = demoRepositoryFingerprint(repo);
  expect(await api.git.inspectCommitMessageEdit({ repoPath: DEMO_REPO, commitHash: hash(3) })).toMatchObject({
    success: true,
    data: { blockReason: reason, expectedHead: '', expectedBranch: '', commitCount: 0 },
  });
  expect(await api.git.rewordCommitMessage(request())).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(await api.git.getCommitMessageEditBackups(DEMO_REPO)).toMatchObject({ success: true, data: [] });
});

it.each(['head', 'branch', 'project'] as const)('rejects stale %s context without editing either project', async (kind) => {
  const { api, repo } = create();
  const input = request();
  if (kind === 'head') repo.commit('docs: a newer commit', { amend: true });
  if (kind === 'branch') repo.command('branch', '-m', 'renamed');
  if (kind === 'project') repo.selectProject(DEMO_SECOND_REPO);
  const before = demoRepositoryFingerprint(repo);
  expect(await api.git.rewordCommitMessage(input)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});

it('cancels before publication without consuming commits or creating a backup', async () => {
  const { api, repo } = create(),
    input = request(),
    before = demoRepositoryFingerprint(repo);
  api.git.onJobEvent((event) => {
    if (event.status === 'progress' && event.message === 'rewriting') void api.git.cancelCommitMessageEdit(input.operationId);
  });
  expect(await api.git.rewordCommitMessage(input)).toMatchObject({ success: false, cancelled: true });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(await api.git.getCommitMessageEditBackups(DEMO_REPO)).toMatchObject({ success: true, data: [] });
  expect(await api.git.rewordCommitMessage(request())).toMatchObject({ success: true, data: { newHead: hash(6) } });
});

it('does not let a second request release the first request’s write ownership', async () => {
  const { api } = create();
  const first = api.git.rewordCommitMessage(request());
  expect(await api.git.rewordCommitMessage(request())).toMatchObject({ success: false });
  expect(await first).toMatchObject({ success: true, data: { newHead: hash(6) } });
});

it('retains external changes observed during progress and refuses the stale rewrite', async () => {
  const { api, repo } = create();
  let changed = false;
  api.git.onJobEvent((event) => {
    if (!changed && event.message === 'rewriting') {
      changed = true;
      repo.command('tag', 'new-external-tag');
    }
  });
  expect(await api.git.rewordCommitMessage(request())).toMatchObject({ success: false });
  expect(repo.commits).toHaveLength(4);
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(repo.tags).toContain('new-external-tag');
  expect(await api.git.getCommitMessageEditBackups(DEMO_REPO)).toMatchObject({ success: true, data: [] });
});

it('preserves a successful rewrite even when a progress consumer throws after publication', async () => {
  const { api, repo } = create();
  api.git.onJobEvent((event) => {
    if (event.status === 'done') throw new Error('A presentation consumer failed.');
  });
  expect(await api.git.rewordCommitMessage(request())).toMatchObject({ success: true, data: { newHead: hash(6) } });
  expect(repo.commits[0].hash).toBe(hash(6));
  expect(repo.messageEditBackups).toHaveLength(1);
});

it('accepts exactly 100,000 message bytes with an empty description', async () => {
  const { api } = create();
  expect(await api.git.rewordCommitMessage({ ...request(), title: 'x'.repeat(99_999), description: '' })).toMatchObject({ success: true });
});

it('recovers the old backup on another branch while retaining main, messages and project-local backups', async () => {
  const { api, repo } = create(),
    input = request();
  const result = await api.git.rewordCommitMessage(input);
  if (!result.success) throw new Error(result.error);
  expect(repo.command('checkout', '-b', 'recovery/before-message', result.data.backupRef!).success).toBe(true);
  expect(repo.branchHeads.get('main')).toBe(hash(6));
  expect(repo.branchHeads.get('recovery/before-message')).toBe(hash(4));
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(resolveDemoCommit(repo, hash(5))?.subject).toBe(input.title);
  expect(resolveDemoCommit(repo, hash(3))?.subject).not.toBe(input.title);
  const backups = structuredClone(repo.messageEditBackups);
  repo.selectProject(DEMO_SECOND_REPO);
  expect(repo.messageEditBackups).toEqual([]);
  repo.selectProject(DEMO_REPO);
  expect(repo.messageEditBackups).toEqual(backups);
  expect(repo.commits[0].hash).toBe(hash(4));
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  expect(repo.messageEditBackups).toEqual([]);
});
