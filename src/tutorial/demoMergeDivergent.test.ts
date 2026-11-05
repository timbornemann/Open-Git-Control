import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO } from './demoRepository';
import { writeDemoFile } from './demoFiles';
import { resolveDemoCommit, demoFileBlame } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';

const source = 'feature/begruessung';
function fixture() {
  const demo = createDemoApi(
    { request: { chapterId: 'branches' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0], prepare: branchRecipe({ current: source }) },
  );
  writeDemoFile(demo.repo, 'LICENSE', 'A saved independent license update\n');
  demo.repo.stage(['LICENSE']);
  expect(demo.repo.commit('docs: update the license').success).toBe(true);
  expect(demo.repo.command('checkout', 'main').success).toBe(true);
  return demo;
}

it.each(['default', 'noFf'] as const)('combines diverged independent trees and records both parents: %s', (mode) => {
  const demo = fixture();
  const target = structuredClone(demo.repo.headFiles);
  const incoming = structuredClone(resolveDemoCommit(demo.repo, source)!.files!);
  expect(demo.repo.command('merge', ...(mode === 'noFf' ? ['--no-ff'] : []), source).success).toBe(true);
  expect(demo.repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4) + ' ' + hash(5) });
  expect(demo.repo.files).toEqual({ ...target, LICENSE: incoming.LICENSE });
  expect(demo.repo.indexFiles).toEqual(demo.repo.files);
  expect(demo.repo.headFiles).toEqual(demo.repo.files);
  expect(demo.repo.branchHeads.get(source)).toBe(hash(5));
  expect(demo.repo.status()).toBe('');
  expect(demoFileBlame(demo.repo, 'LICENSE', 'HEAD')[0].commitHash).toBe(hash(5));
});

it('prepares only the incoming independent change for a divergent squash', () => {
  const demo = fixture();
  const target = structuredClone(demo.repo.headFiles);
  expect(demo.repo.command('merge', '--squash', source).success).toBe(true);
  expect(demo.repo.commits[0].hash).toBe(hash(4));
  expect(demo.repo.headFiles).toEqual(target);
  expect([...demo.repo.staged]).toEqual(['LICENSE']);
  expect(demo.repo.files['README.md']).toEqual(target['README.md']);
  expect(demo.repo.commit('docs: combine the update').success).toBe(true);
  expect(demo.repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4) });
  expect(demo.repo.command('branch', '-d', source)).toMatchObject({ success: false });
});

it('preserves unrelated working and untracked data during an independent merge', () => {
  const demo = fixture();
  writeDemoFile(demo.repo, 'package.json', 'Keep this unfinished package edit\n');
  writeDemoFile(demo.repo, 'private-note.txt', 'Keep this untracked note\n');
  expect(demo.repo.command('merge', source).success).toBe(true);
  expect(demo.repo.files['package.json']).toBe('Keep this unfinished package edit\n');
  expect(demo.repo.files['private-note.txt']).toBe('Keep this untracked note\n');
  expect(demo.repo.modified.has('package.json')).toBe(true);
  expect(demo.repo.untracked.has('private-note.txt')).toBe(true);
  expect(demo.repo.commits[0].files!['package.json']).not.toBe('Keep this unfinished package edit\n');
  expect(demo.repo.commits[0].files!['private-note.txt']).toBeUndefined();
});

it('still refuses ff-only without a partial tree change after divergence', () => {
  const demo = fixture();
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('merge', '--ff-only', source)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('rechecks captured outward revisions while combining diverged target files', async () => {
  const demo = fixture();
  expect(demo.repo.command('checkout', source).success).toBe(true);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'mergeIntoBranch', source, 'main', 'default', hash(5), hash(4))).toMatchObject({ success: true });
  expect(demo.repo.branch).toBe('main');
  expect(demo.repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4) + ' ' + hash(5) });
});

it('protects staged work from being included in an automatic divergent merge commit', () => {
  const demo = fixture();
  writeDemoFile(demo.repo, 'package.json', 'Unrelated staged change\n');
  demo.repo.stage(['package.json']);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('merge', source)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('refuses to overwrite an overlapping working edit before changing any merge state', () => {
  const demo = fixture();
  writeDemoFile(demo.repo, 'LICENSE', 'Keep this unfinished license edit\n');
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('merge', source)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('refuses portable file/directory collisions even when differently cased paths sort in the opposite order', () => {
  const demo = fixture();
  demo.repo.command('checkout', source);
  writeDemoFile(demo.repo, 'DOCS/guide.md', 'An incoming guide\n');
  demo.repo.stage(['DOCS/guide.md']);
  expect(demo.repo.commit('docs: add guide').success).toBe(true);
  demo.repo.command('checkout', 'main');
  writeDemoFile(demo.repo, 'docs', 'A target file\n');
  demo.repo.stage(['docs']);
  expect(demo.repo.commit('docs: target file').success).toBe(true);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('merge', source)).toMatchObject({ success: false, error: expect.stringMatching(/collide/) });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('refuses unrelated histories without introducing a new tree or commit', () => {
  const demo = fixture();
  demo.repo.commits.push({
    hash: hash(100),
    parent: '',
    subject: 'unrelated root',
    date: new Date(0).toISOString(),
    files: { 'foreign.txt': 'Other history' },
  });
  demo.repo.branchHeads.set(source, hash(100));
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('merge', source)).toMatchObject({ success: false, error: expect.stringMatching(/common merge base/) });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});
