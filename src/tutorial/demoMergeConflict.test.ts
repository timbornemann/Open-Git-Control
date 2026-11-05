import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO, type DemoRepository } from './demoRepository';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { resolveDemoCommit } from './demoHistory';
import { writeDemoFile } from './demoFiles';

const source = 'feature/begruessung';
function fixture(mode: 'default' | 'squash' = 'default', setup?: (repo: DemoRepository) => void) {
  const prepare = branchRecipe();
  prepare.branches = {
    ...prepare.branches!,
    fixture: 'diverged-readme',
    heads: [
      { name: 'main', commit: 4 },
      { name: source, commit: 5 },
    ],
  };
  const demo = createDemoApi(
    { request: { chapterId: 'branches' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0], prepare },
  );
  setup?.(demo.repo);
  const before = structuredClone(demo.repo.files);
  const result = demo.repo.command('merge', ...(mode === 'squash' ? ['--squash'] : []), source);
  return { ...demo, before, result };
}

it('starts a real unresolved tree without advancing either saved branch', async () => {
  const { repo, api, result, before } = fixture();
  expect(result).toMatchObject({ success: false });
  expect(repo.conflicted).toBe(true);
  expect(repo.status()).toBe('UU README.md\n');
  expect(repo.files['README.md']).toContain('<<<<<<< HEAD\nGreeting: Hello world!');
  expect(repo.files['README.md']).toContain('=======\nGreeting: Hello team!');
  expect(repo.files['README.md']).toContain('>>>>>>> ' + source);
  expect(repo.indexFiles).toEqual(before);
  expect(repo.headFiles).toEqual(before);
  expect(repo.branchHeads.get('main')).toBe(hash(4));
  expect(repo.branchHeads.get(source)).toBe(hash(5));
  expect(repo.commits).toHaveLength(5);
  expect(await api.git.getSequencerState()).toMatchObject({ success: true, data: { operation: 'merge' } });
  expect(repo.command('mergeContinue')).toMatchObject({ success: false });
});

it.each([
  ['conflictTakeOurs', 4],
  ['conflictTakeTheirs', 5],
] as const)('checks out %s without silently staging or resolving the file', (name, revision) => {
  const { repo, before } = fixture();
  expect(repo.command(name, 'README.md')).toMatchObject({ success: true });
  expect(repo.files['README.md']).toEqual(resolveDemoCommit(repo, hash(revision))!.files!['README.md']);
  expect(repo.indexFiles).toEqual(before);
  expect(repo.conflicted).toBe(true);
  expect(repo.status()).toBe('UU README.md\n');
});

it('rejects unknown paths and remaining markers without replacing the user draft', () => {
  const { repo } = fixture();
  for (const [name, path] of [
    ['conflictTakeOurs', 'missing.txt'],
    ['conflictMarkResolved', 'README.md'],
    ['conflictTakeDeleted', '../README.md'],
  ] as const) {
    const before = demoRepositoryFingerprint(repo);
    expect(repo.command(name, path)).toMatchObject({ success: false });
    expect(demoRepositoryFingerprint(repo)).toBe(before);
  }
});

it('keeps a save-only draft unresolved, then stages its exact content and continues with two parents', async () => {
  const { repo, api } = fixture();
  const content = '# OGC-Lernprojekt\n\nA deliberate combined greeting.\n';
  expect(await api.git.writeRepoFile('README.md', content, DEMO_REPO)).toMatchObject({ success: true });
  expect(repo.conflicted).toBe(true);
  expect(repo.status()).toBe('UU README.md\n');
  expect(repo.command('conflictMarkResolved', 'README.md')).toMatchObject({ success: true });
  expect(repo.indexFiles['README.md']).toBe(content);
  expect(repo.conflicted).toBe(false);
  expect(repo.status()).toBe('M  README.md\n');
  expect(await api.git.getSequencerState()).toMatchObject({ success: true, data: { operation: 'merge' } });
  expect(repo.command('mergeContinue')).toMatchObject({ success: true });
  expect(repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4) + ' ' + hash(5), files: { 'README.md': content } });
  expect(repo.status()).toBe('');
  expect(await api.git.getSequencerState()).toMatchObject({ success: true, data: { operation: null } });
});

it('can finish by retaining the current tree even when no content change remains staged', () => {
  const { repo } = fixture();
  expect(repo.command('conflictTakeOurs', 'README.md')).toMatchObject({ success: true });
  expect(repo.command('conflictMarkResolved', 'README.md')).toMatchObject({ success: true });
  expect(repo.staged.size).toBe(0);
  expect(repo.command('mergeContinue')).toMatchObject({ success: true });
  expect(repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4) + ' ' + hash(5) });
});

it('ordinary commit finishes a resolved merge, while amend and new merges remain blocked', () => {
  const { repo } = fixture();
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  const before = demoRepositoryFingerprint(repo);
  expect(repo.commit('wrong amend', { amend: true })).toMatchObject({ success: false });
  expect(repo.command('merge', source)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(repo.commit('docs: resolved greeting')).toMatchObject({ success: true });
  expect(repo.commits[0]).toMatchObject({ parent: hash(4) + ' ' + hash(5), subject: 'docs: resolved greeting' });
});

it('aborts the affected merge paths and retains unrelated edits made before and during the operation', async () => {
  const { repo, api, before } = fixture();
  writeDemoFile(repo, 'private-note.txt', 'An unrelated note\n');
  writeDemoFile(repo, 'package.json', 'An unfinished package edit\n');
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  expect(repo.command('mergeAbort')).toMatchObject({ success: true });
  expect(repo.files['README.md']).toEqual(before['README.md']);
  expect(repo.headFiles).toEqual(before);
  expect(repo.indexFiles).toEqual(before);
  expect(repo.files['private-note.txt']).toBe('An unrelated note\n');
  expect(repo.files['package.json']).toBe('An unfinished package edit\n');
  expect(repo.commits).toHaveLength(5);
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(await api.git.getSequencerState()).toMatchObject({ success: true, data: { operation: null } });
});

it('takes a deletion explicitly and keeps the merge pending until continuation', () => {
  const { repo } = fixture();
  expect(repo.command('conflictTakeDeleted', 'README.md')).toMatchObject({ success: true });
  expect(repo.files['README.md']).toBeUndefined();
  expect(repo.indexFiles['README.md']).toBeUndefined();
  expect(repo.status()).toBe('D  README.md\n');
  expect(repo.command('mergeContinue')).toMatchObject({ success: true });
  expect(repo.commits[0].files!['README.md']).toBeUndefined();
});

it('does not pretend that a squash conflict owns a merge continuation or a second parent', async () => {
  const { repo, api } = fixture('squash');
  expect(repo.conflicted).toBe(true);
  expect(await api.git.getSequencerState()).toMatchObject({ success: true, data: { operation: null } });
  expect(repo.command('mergeContinue')).toMatchObject({ success: false });
  expect(repo.command('mergeAbort')).toMatchObject({ success: false });
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  expect(repo.commit('docs: one squash')).toMatchObject({ success: true });
  expect(repo.commits[0]).toMatchObject({ parent: hash(4), subject: 'docs: one squash' });
});

it('keeps unfinished merge state local to its simulated project and resets it on lesson entry', async () => {
  const { repo, api } = fixture();
  repo.registerProject(DEMO_SECOND_REPO, { 'README.md': 'Another project\n' }, true);
  repo.selectProject(DEMO_SECOND_REPO);
  expect(repo.conflicted).toBe(false);
  expect(repo.command('mergeContinue')).toMatchObject({ success: false });
  expect(await api.git.runGitCommandForRepo(DEMO_REPO, 'mergeAbort')).toMatchObject({ success: false });
  repo.selectProject(DEMO_REPO);
  expect(repo.conflicted).toBe(true);
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  expect(repo.command('mergeContinue')).toMatchObject({ success: true });
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'merge-review')!.steps[0]);
  expect(repo.command('mergeContinue')).toMatchObject({ success: false });
  expect(repo.command('mergeAbort')).toMatchObject({ success: false });
});

it('still recognizes a complete marker block while accepting isolated Markdown rules', () => {
  const { repo } = fixture();
  writeDemoFile(repo, 'README.md', '# Deliberate content\n=======\nA Markdown rule alone is not a conflict.\n');
  expect(repo.command('conflictMarkResolved', 'README.md')).toMatchObject({ success: true });
});

it.each(['checkout', 'reset'] as const)('resolves a conflict path when restoring its index from a saved revision with %s', async (command) => {
  const { repo, api } = fixture();
  expect(repo.command(command, 'HEAD', '--', 'README.md')).toMatchObject({ success: true });
  expect(repo.conflicted).toBe(false);
  expect(await api.git.getSequencerState()).toMatchObject({ success: true, data: { operation: 'merge' } });
  expect(repo.indexFiles['README.md']).toEqual(repo.headFiles['README.md']);
  if (command === 'checkout') expect(repo.files['README.md']).toEqual(repo.headFiles['README.md']);
  else expect(repo.files['README.md']).toContain('<<<<<<< HEAD');
});

it('refuses restoring an unmerged work file without choosing a saved side', () => {
  const { repo } = fixture();
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('checkout', '--', 'README.md')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});

it('can remove an unresolved index entry explicitly while keeping its working file as untracked', () => {
  const { repo } = fixture();
  expect(repo.command('rm', '--cached', '--', 'README.md')).toMatchObject({ success: true });
  expect(repo.conflicted).toBe(false);
  expect(repo.status()).toBe('D  README.md\n?? README.md\n');
  expect(repo.files['README.md']).toContain('<<<<<<< HEAD');
});

it('creates the existing prepared conflict scenario from saved branch trees too', async () => {
  const { repo } = fixture();
  repo.reset(
    TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'conflicts')!.steps.find((step) => step.scenario === 'conflict')!,
    'en',
  );
  expect(repo.conflicted).toBe(true);
  expect(repo.branchHeads.get(source)).toBe(hash(5));
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  expect(repo.command('mergeContinue').success).toBe(true);
  expect(repo.commits[0].parent).toBe(hash(4) + ' ' + hash(5));
});

it('keeps other conflict paths unresolved after resolving just one file', async () => {
  const { repo, api } = fixture('default', (repo) => {
    resolveDemoCommit(repo, source)!.files!.LICENSE = 'Incoming license edit\n';
    resolveDemoCommit(repo, 'main')!.files!.LICENSE = 'Current license edit\n';
    repo.files.LICENSE = repo.indexFiles.LICENSE = repo.headFiles.LICENSE = 'Current license edit\n';
  });
  expect(repo.status()).toContain('UU LICENSE\n');
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
  expect(repo.conflicted).toBe(true);
  expect(repo.status()).toContain('UU LICENSE\n');
  expect(repo.status()).toContain('M  README.md\n');
  expect(repo.command('mergeContinue').success).toBe(false);
  expect(await api.git.getWorkingDirectoryFileInfo('LICENSE', DEMO_REPO)).toMatchObject({
    success: true,
    data: { git: { conflicted: true } },
  });
  expect(repo.command('conflictTakeOurs', 'LICENSE').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'LICENSE').success).toBe(true);
  expect(repo.command('mergeContinue').success).toBe(true);
  expect(repo.commits[0].files!.LICENSE).toBe('Current license edit\n');
});

it.each(['UD', 'DU'] as const)('represents a %s modify/delete conflict and requires an existing side or explicit deletion', (code) => {
  const { repo } = fixture('default', (repo) => {
    const incoming = resolveDemoCommit(repo, source)!.files!;
    const current = resolveDemoCommit(repo, 'main')!.files!;
    if (code === 'UD') {
      delete incoming.LICENSE;
      current.LICENSE = repo.files.LICENSE = repo.indexFiles.LICENSE = repo.headFiles.LICENSE = 'Current license edit\n';
    } else {
      incoming.LICENSE = 'Incoming license edit\n';
      for (const files of [current, repo.files, repo.indexFiles, repo.headFiles]) delete files.LICENSE;
    }
  });
  expect(repo.status()).toContain(code + ' LICENSE\n');
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command(code === 'UD' ? 'conflictTakeTheirs' : 'conflictTakeOurs', 'LICENSE')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(repo.command('conflictTakeDeleted', 'LICENSE').success).toBe(true);
  expect(repo.status()).not.toContain(code + ' LICENSE');
  expect(repo.files.LICENSE).toBeUndefined();
  expect(repo.conflicted).toBe(true);
});
