import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { demoBlobBytes, isDemoGitlink } from './demoBlob';
import { prepareDemoCheckoutFiles } from './demoBranchCommands';
import { prepareDemoHardResetFiles } from './demoHardReset';
import { refreshDemoFiles } from './demoFiles';
import {
  SUBMODULE_PATH as path,
  SUBMODULE_RECORDED as first,
  SUBMODULE_OTHER as second,
  SUBMODULE_NEW_URL as newUrl,
  SUBMODULE_ORIGINAL_URL as originalUrl,
} from '@/shared/tutorial/submoduleLessonExamples';
import type { TutorialStep } from '@/shared/tutorial/types';
import { parseGitSubmoduleStatus } from '@/utils/gitParsing';
import { submoduleParityFixture } from './__tests__/submoduleParityFixture';

const create = (submodules: NonNullable<TutorialStep['prepare']>['submodules'], language: 'de' | 'en' = 'de') =>
  createDemoApi(
    { request: { chapterId: 'submodules-navigation' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { id: 'fixture', title: ['Test', 'Test'], description: ['Test', 'Test'], target: 'body', area: 'repo', scenario: 'history', prepare: { submodules } },
  );
const status = (repo: ReturnType<typeof create>['repo']) => {
  const result = repo.command('submoduleStatus');
  expect(result.success).toBe(true);
  return parseGitSubmoduleStatus(result.success ? result.data : '');
};
describe.each(['de', 'en'] as const)('isolated submodules (%s)', (language) => {
  it('initializes at the index-recorded commit without moving parent history or staging child files', async () => {
    const { repo, api, unsupported } = create('uninitialized', language);
    const parent = structuredClone({ commits: repo.commits, index: repo.indexFiles, head: repo.headFiles });
    expect(status(repo)).toMatchObject([{ path, stateCode: 'uninitialized', commit: first }]);
    expect(repo.submodules.get(path)).toMatchObject({ initialized: false, configuredUrl: null, originUrl: null });
    expect(await api.runGitCommand('submoduleSyncRecursive')).toMatchObject({ success: true });
    expect(repo.submodules.get(path)?.configuredUrl).toBeNull();
    expect(await api.runGitCommand('submoduleUpdateInitRecursive')).toMatchObject({ success: true });
    expect(status(repo)).toMatchObject([{ stateCode: 'clean', commit: first }]);
    expect(repo.submodules.get(path)).toEqual({ initialized: true, configuredUrl: originalUrl, originUrl: originalUrl });
    expect({ commits: repo.commits, index: repo.indexFiles, head: repo.headFiles }).toEqual(parent);
    expect(repo.changeCount()).toBe(0);
    expect(unsupported.size).toBe(0);
    expect(repo.events.has('submodules-update-repeated')).toBe(false);
    await api.runGitCommand('submoduleUpdateInitRecursive');
    expect(repo.events.has('submodules-update-repeated')).toBe(true);
  });
  it('updates a different checked-out commit to the index target, rather than the latest child branch', async () => {
    const { repo, api } = create('different-commit', language);
    expect(status(repo)).toMatchObject([{ stateCode: 'dirty', commit: second }]);
    expect(repo.modified).toEqual(new Set([path]));
    expect(repo.diff(path)).toContain('160000');
    expect(repo.diff(path)).toContain('-Subproject commit ' + first);
    expect(repo.diff(path)).toContain('+Subproject commit ' + second);
    await api.runGitCommand('submoduleUpdateInitRecursive');
    expect(status(repo)).toMatchObject([{ stateCode: 'clean', commit: first }]);
    expect(repo.changeCount()).toBe(0);
  });
  it('stages and commits a Gitlink object without copying child repository files into the parent', () => {
    const { repo } = create('different-commit', language);
    repo.stage([path]);
    expect(status(repo)).toMatchObject([{ stateCode: 'clean', commit: second }]);
    expect(repo.staged).toEqual(new Set([path]));
    expect(repo.commit('chore: update design')).toMatchObject({ success: true });
    expect(repo.commits[0].files?.[path]).toEqual({ gitlink: second });
    expect(Object.keys(repo.commits[0].files!).some((entry) => entry.startsWith(path + '/'))).toBe(false);
    expect(() => demoBlobBytes(repo.files[path])).toThrow(/separate repository/);
  });
  it('syncs changed configuration without updating commits or modifying tracked files', async () => {
    const { repo, api } = create('changed-url', language);
    const before = structuredClone({ files: repo.files, index: repo.indexFiles, commits: repo.commits });
    expect(repo.submodules.get(path)?.configuredUrl).toBe(originalUrl);
    await api.runGitCommand('submoduleSyncRecursive');
    expect(repo.submodules.get(path)).toEqual({ initialized: true, configuredUrl: newUrl, originUrl: newUrl });
    expect({ files: repo.files, index: repo.indexFiles, commits: repo.commits }).toEqual(before);
    expect(repo.events.has('submodules-synced')).toBe(true);
  });
  it('opens only a known scoped practice folder and preserves the active repository', async () => {
    const { repo, api } = create('ready', language);
    expect(await api.openSubmodule(path, 'C:/personal')).toMatchObject({ success: false });
    for (const invalid of ['../secret', path + '/../other', path + '/child', 'README.md'])
      expect(await api.openSubmodule(invalid, DEMO_REPO)).toMatchObject({ success: false });
    expect(repo.lastOpenedPath).toBe('');
    expect(await api.openSubmodule(path, DEMO_REPO)).toMatchObject({ success: true });
    expect(repo.lastOpenedPath).toBe(DEMO_REPO + '/' + path);
    expect(repo.activeRepo).toBe(DEMO_REPO);
    expect(repo.events.has('submodule-opened')).toBe(true);
    repo.registerProject(DEMO_SECOND_REPO, { 'note.txt': 'other' }, true);
    repo.selectProject(DEMO_SECOND_REPO);
    expect(status(repo)).toEqual([]);
    expect(await api.openSubmodule(path, DEMO_SECOND_REPO)).toMatchObject({ success: false });
    repo.selectProject(DEMO_REPO);
    expect(status(repo)).toMatchObject([{ stateCode: 'clean' }]);
    expect(create('uninitialized', language).repo.submodules.get(path)?.initialized).toBe(false);
  });
  it('lists a Gitlink as a directory, excludes it from text search and rejects destructive tree operations', async () => {
    const { repo, api } = create('ready', language);
    expect(await api.listWorkingDirectory(DEMO_REPO, 'packages')).toMatchObject({ success: true, data: [{ path, kind: 'directory' }] });
    expect(await api.getRepositoryFilePreview({ repoPath: DEMO_REPO, path, source: 'staged' })).toMatchObject({
      success: true,
      data: { kind: 'missing', editable: false },
    });
    expect(repo.command('show', ':' + path)).toMatchObject({ success: false });
    expect(await api.searchWorkingDirectory({ query: 'design', mode: 'filename' }, DEMO_REPO)).toMatchObject({ success: true, data: { files: [] } });
    expect(await api.writeRepoFile(path, 'text', DEMO_REPO)).toMatchObject({ success: false });
    expect(await api.writeRepoFile(path + '/child.txt', 'text', DEMO_REPO)).toMatchObject({ success: false });
    for (const protectedPath of [path, 'packages', path + '/child'])
      expect(await api.deleteWorkingDirectoryEntry(protectedPath, DEMO_REPO)).toMatchObject({ success: false });
    expect(await api.moveWorkingDirectoryEntry('packages', 'moved', false, DEMO_REPO)).toMatchObject({ success: false });
    expect(isDemoGitlink(repo.files[path])).toBe(true);
  });
  it('rejects unavailable mappings and child objects without partially changing configuration', async () => {
    const { repo, api } = create('ready', language);
    const before = structuredClone(repo.submodules);
    repo.files['.gitmodules'] = '[submodule "other"]\n\tpath = packages/design-other\n\turl = https://personal.invalid/other.git\n';
    expect(await api.runGitCommand('submoduleSyncRecursive')).toMatchObject({ success: false });
    expect(repo.submodules).toEqual(before);
    const fresh = create('ready', language);
    fresh.repo.indexFiles[path] = { gitlink: 'f'.repeat(40) };
    expect(await fresh.api.runGitCommand('submoduleUpdateInitRecursive')).toMatchObject({ success: false });
    expect(fresh.repo.files[path]).toEqual({ gitlink: first });
    expect(fresh.repo.submodules).toEqual(before);
  });
});
describe('native Git submodule parity', () => {
  it('matches uninitialized status, initialization and index-target update against two real child commits', async () => {
    const f = submoduleParityFixture();
    try {
      const { repo, api } = create('uninitialized');
      const native = () => parseGitSubmoduleStatus(f.git(['submodule', 'status', '--recursive']))[0];
      expect(native()).toMatchObject({ stateCode: 'uninitialized', commit: f.first });
      const parentHead = f.git(['rev-parse', 'HEAD']);
      f.git(['submodule', 'update', '--init', '--recursive']);
      await api.runGitCommand('submoduleUpdateInitRecursive');
      expect(native().stateCode).toBe(status(repo)[0].stateCode);
      expect(f.childGit(['rev-parse', 'HEAD']).trim()).toBe(f.first);
      f.childGit(['checkout', f.second]);
      repo.files[path] = { gitlink: second };
      refreshDemoFiles(repo);
      expect(native().stateCode).toBe(status(repo)[0].stateCode);
      expect(f.git(['status', '--porcelain=v1'])).toContain(' M packages/design');
      f.git(['submodule', 'update', '--init', '--recursive']);
      await api.runGitCommand('submoduleUpdateInitRecursive');
      expect(native().stateCode).toBe('clean');
      expect(status(repo)[0].commit).toBe(first);
      expect(f.git(['rev-parse', 'HEAD'])).toBe(parentHead);
      expect(f.git(['status', '--porcelain=v1'])).toBe('');
      expect(repo.changeCount()).toBe(0);
    } finally {
      f.cleanup();
    }
  }, 20_000);
  it('matches recursive URL synchronization without changing child HEAD or parent index', async () => {
    const f = submoduleParityFixture();
    try {
      const { repo, api } = create('changed-url');
      f.git(['submodule', 'update', '--init', '--recursive']);
      f.git(['config', '-f', '.gitmodules', 'submodule.design.url', f.moved]);
      const index = f.git(['ls-files', '--stage', '-z']);
      f.git(['submodule', 'sync', '--recursive']);
      await api.runGitCommand('submoduleSyncRecursive');
      expect(f.git(['config', '--get', 'submodule.design.url']).trim()).toBe(f.moved);
      expect(f.childGit(['config', '--get', 'remote.origin.url']).trim()).toBe(f.moved);
      expect(repo.submodules.get(path)?.configuredUrl).toBe(newUrl);
      expect(f.childGit(['rev-parse', 'HEAD']).trim()).toBe(f.first);
      expect(f.git(['ls-files', '--stage', '-z'])).toBe(index);
    } finally {
      f.cleanup();
    }
  }, 20_000);
  it('preserves a child checkout when a non-recursive parent checkout, restore or hard reset changes its recorded target', () => {
    const f = submoduleParityFixture();
    try {
      f.git(['submodule', 'update', '--init', '--recursive']);
      f.childGit(['checkout', f.second]);
      const { repo } = create('different-commit');
      f.git(['checkout', '--', path]);
      repo.command('checkout', '--', path);
      expect(f.childGit(['rev-parse', 'HEAD']).trim()).toBe(f.second);
      expect(repo.files[path]).toEqual({ gitlink: second });
      f.git(['reset', '--hard', 'HEAD']);
      expect(prepareDemoHardResetFiles(repo, repo.headFiles)[path]).toEqual({ gitlink: second });
      expect(f.childGit(['rev-parse', 'HEAD']).trim()).toBe(f.second);
      const target = structuredClone(repo.headFiles);
      target[path] = { gitlink: second };
      expect(prepareDemoCheckoutFiles(repo, target).files[path]).toEqual({ gitlink: second });
      expect(prepareDemoCheckoutFiles(repo, target).index[path]).toEqual({ gitlink: second });
    } finally {
      f.cleanup();
    }
  }, 20_000);
});
