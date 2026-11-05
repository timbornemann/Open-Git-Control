import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { resolveDemoCommit } from './demoHistory';
import { reachableDemoCommits } from './demoBranchRefs';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';
import { parseGitLog } from '@/utils/gitParsing';
const create = () =>
  createDemoApi(
    { request: { chapterId: 'history' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0],
  );

it('resolves the original tag with its full peeled ref and navigates to its saved commit', async () => {
  const { repo, api } = create();
  expect(resolveDemoCommit(repo, 'refs/tags/v1.0.0^{commit}')?.hash).toBe(hash(2));
  expect(await api.git.runGitCommandForRepo(DEMO_REPO, 'show', '--quiet', '--format=%H', 'refs/tags/v1.0.0^{commit}')).toMatchObject({
    success: true,
    data: hash(2),
  });
  expect(repo.commits[0].hash).toBe(hash(4));
});

it('pins a lightweight tag to its saved commit while later commits move the branch', () => {
  const { repo } = create();
  expect(repo.command('tag', 'v1.1.0').success).toBe(true);
  writeDemoFile(repo, 'LICENSE', 'A later license\n');
  repo.stage(['LICENSE']);
  repo.commit('docs: later license');
  expect(repo.commits[0].hash).toBe(hash(5));
  expect(resolveDemoCommit(repo, 'v1.1.0')?.hash).toBe(hash(4));
  const graph = parseGitLog(repo.command('log').data || '');
  expect(graph.find((commit) => commit.hash === hash(4))?.refs).toContain('tag: v1.1.0');
  expect(graph.find((commit) => commit.hash === hash(5))?.refs).not.toContain('tag: v1.1.0');
});

it('records an annotated message at the explicitly selected saved target', () => {
  const { repo } = create();
  expect(repo.command('tag', '-a', 'v1.2.0', '-m', 'A deliberate release note', hash(3)).success).toBe(true);
  expect(resolveDemoCommit(repo, 'refs/tags/v1.2.0^{commit}')?.hash).toBe(hash(3));
  const result = repo.command('forEachRef', '--format=%(refname)%00%(objecttype)%00%(*objectname)%00%(contents)', 'refs/tags/v1.2.0');
  expect(result).toMatchObject({ success: true, data: 'refs/tags/v1.2.0\0tag\0' + hash(3) + '\0A deliberate release note\n\n' });
});

it.each(['bad name', 'a..b', '.hidden', 'a.lock/b', 'a//b', '-option', 'HEAD', 'a['])('rejects invalid tag %s without changing state', (name) => {
  const { repo } = create();
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('tag', name).success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});

it.each(['@', 'a]', 'releases/v1.1.0'])('accepts a valid tag name supported by native Git: %s', (name) => {
  const { repo } = create();
  expect(repo.command('tag', name).success).toBe(true);
  expect(resolveDemoCommit(repo, 'refs/tags/' + name + '^{commit}')?.hash).toBe(hash(4));
});

it('rejects duplicate and prefix collisions rather than moving an existing reference', () => {
  const { repo } = create();
  repo.command('tag', 'releases/v1');
  for (const name of ['releases/v1', 'releases', 'releases/v1/other']) {
    const before = demoRepositoryFingerprint(repo);
    expect(repo.command('tag', name, hash(1)).success).toBe(false);
    expect(demoRepositoryFingerprint(repo)).toBe(before);
  }
});

it('deletes only the chosen reference and preserves saved objects and open work', () => {
  const { repo } = create();
  repo.command('tag', 'v1.1.0');
  writeDemoFile(repo, 'LICENSE', 'Keep this working draft\n');
  const files = structuredClone(repo.files),
    commits = structuredClone(repo.commits);
  expect(repo.command('tag', '-d', 'v1.1.0').success).toBe(true);
  expect(repo.tags).toEqual(['v1.0.0']);
  expect(repo.files).toEqual(files);
  expect(repo.commits).toEqual(commits);
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('tag', '-d', 'missing').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});

it('keeps a tagged abandoned branch commit reachable until the tag is removed', () => {
  const { repo } = create();
  repo.command('checkout', 'feature/begruessung');
  writeDemoFile(repo, 'LICENSE', 'Independent saved license\n');
  repo.stage(['LICENSE']);
  repo.commit('docs: feature license');
  repo.command('tag', 'v1.1.0');
  repo.command('checkout', 'main');
  repo.command('branch', '-D', 'feature/begruessung');
  expect(reachableDemoCommits(repo).map((commit) => commit.hash)).toContain(hash(5));
  repo.command('tag', '-d', 'v1.1.0');
  expect(reachableDemoCommits(repo).map((commit) => commit.hash)).not.toContain(hash(5));
  expect(repo.commits.some((commit) => commit.hash === hash(5))).toBe(true);
});

it('sorts the sample versions by version number without mutating references during reads', () => {
  const { repo } = create();
  for (const name of ['v1.2.0', 'v1.10.0', 'v1.2.0-rc1', 'v1.02.0']) repo.command('tag', name);
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('tag', '-l', '--sort=-v:refname').data).toBe('v1.10.0\nv1.2.0-rc1\nv1.2.0\nv1.0.0\nv1.02.0');
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});

it('keeps tag targets isolated by project and resets chapter examples', () => {
  const { repo } = create();
  repo.command('tag', 'v1.1.0');
  repo.selectProject(DEMO_SECOND_REPO);
  expect(repo.tags).toEqual([]);
  repo.command('tag', 'notes-v1');
  repo.selectProject(DEMO_REPO);
  expect(resolveDemoCommit(repo, 'v1.1.0')?.hash).toBe(hash(4));
  expect(repo.tags).not.toContain('notes-v1');
  repo.selectProject(DEMO_SECOND_REPO);
  expect(resolveDemoCommit(repo, 'notes-v1')?.hash).toBe(hash(100));
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  expect(repo.tags).toEqual(['v1.0.0']);
  expect(resolveDemoCommit(repo, 'v1.1.0')).toBeUndefined();
});

it('retains format-like message text verbatim when reading tag reference fields', () => {
  const { repo } = create();
  repo.command('tag', '-a', 'v1.2.0', '-m', 'Keep %00 and %(objectname) literally.');
  expect(repo.command('forEachRef', '--format=%(refname)%00%(contents)', 'refs/tags/v1.2.0').data).toBe(
    'refs/tags/v1.2.0\0Keep %00 and %(objectname) literally.\n\n',
  );
});
