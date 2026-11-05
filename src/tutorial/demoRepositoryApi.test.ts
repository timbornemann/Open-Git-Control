import { describe, expect, it } from 'vitest';
import type { TutorialLaunchContext, TutorialRepositoriesSetup, TutorialStep } from '@/shared/tutorial/types';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_NEW_REPO, DEMO_SECOND_REPO, DEMO_CLONE_REPO } from './demoRepository';
import { PRACTICE_CLONE_URL } from './demoRepositoryApi';
const context: TutorialLaunchContext = {
  request: { chapterId: 'repositories' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = (repositories: TutorialRepositoriesSetup = {}) =>
  createDemoApi(context, {
    id: 'test',
    title: ['', ''],
    description: ['', ''],
    area: 'localRepos',
    target: 'body',
    scenario: 'clean',
    prepare: { repositories },
  } satisfies TutorialStep);
describe('practice repository management', () => {
  it('keeps file changes and commit history separate when switching projects', async () => {
    const { api, repo } = create();
    await api.git.writeRepoFile('README.md', 'My practice edit');
    await api.git.setRepoPath(DEMO_SECOND_REPO);
    expect(repo.files['README.md']).toContain('Notizbuch');
    expect(repo.modified.size).toBe(0);
    expect(repo.commits).toHaveLength(1);
    expect(await api.git.getRepositoryChangeSummary(DEMO_REPO)).toMatchObject({ data: { changeCount: 1 } });
    expect(await api.git.getRepositoryChangeSummary(DEMO_SECOND_REPO)).toMatchObject({ data: { changeCount: 0 } });
    await api.git.setRepoPath(DEMO_REPO);
    expect(repo.files['README.md']).toBe('My practice edit');
    expect(repo.modified.has('README.md')).toBe(true);
    expect(repo.commits).toHaveLength(4);
    await expect(api.git.setRepoPath('C:/personal')).rejects.toThrow('Unknown practice');
  });
  it('initializes a sample folder without inventing commits or a remote', async () => {
    const { api, repo } = create();
    expect((await api.git.gitInit(DEMO_REPO)).success).toBe(false);
    const result = await api.git.gitInit(DEMO_NEW_REPO, {
      createReadme: true,
      license: 'GPL-3.0-only',
      copyrightHolder: 'Alex Beispiel',
      programName: 'OGC-Testprogramm',
      programDescription: 'Ein Lernprojekt',
    });
    expect(result).toMatchObject({ success: true, createdFiles: ['README.md', 'LICENSE', 'NOTICE'] });
    await api.git.setRepoPath(DEMO_NEW_REPO);
    expect(repo.commits).toHaveLength(0);
    expect([...repo.untracked]).toEqual(['README.md', 'LICENSE', 'NOTICE']);
    expect(await api.git.getRepoOriginUrl(DEMO_NEW_REPO)).toMatchObject({ success: true, data: null });
    expect((await api.git.createCommit({ title: 'amend', amend: true })).success).toBe(false);
    await api.git.stagePaths(['README.md']);
    await api.git.createCommit({ title: 'docs: initial' });
    expect(repo.commits[0].parent).toBe('');
    expect(repo.commits).toHaveLength(1);
  });
  it('simulates clone output and refuses arbitrary remote addresses or destinations', async () => {
    const { api, repo } = create();
    const lines: string[] = [];
    const stop = api.git.onCloneProgress((line) => lines.push(line));
    expect((await api.git.gitClone('https://example.com/private.git', '/tutorial')).success).toBe(false);
    expect((await api.git.gitClone(PRACTICE_CLONE_URL, 'C:/personal')).success).toBe(false);
    expect((await api.git.gitClone(PRACTICE_CLONE_URL, '/tutorial', 'OGC-Kopie')).success).toBe(true);
    stop();
    expect(lines.join('\n')).toContain('Receiving objects: 100%');
    await api.git.setRepoPath(DEMO_CLONE_REPO);
    expect(repo.commits).toHaveLength(1);
    expect(await api.git.getRepoOriginUrl(DEMO_CLONE_REPO)).toMatchObject({ data: PRACTICE_CLONE_URL });
    expect(repo.events.has('repo-cloned')).toBe(true);
  });
  it('shares registry updates with bootstrap and removes entries without deleting project data', async () => {
    const { api, repo } = create();
    await api.repos.mutateStoredRepos({ kind: 'metadata', path: DEMO_REPO, pinned: true });
    await api.repos.mutateStoredRepos({ kind: 'remove', path: DEMO_SECOND_REPO });
    expect((await api.app.getBootstrap()).repositories.repos).toMatchObject([{ path: DEMO_REPO, pinned: true }]);
    expect(repo.hasProject(DEMO_SECOND_REPO)).toBe(true);
    await api.repos.mutateStoredRepos({ kind: 'add', path: DEMO_SECOND_REPO });
    expect((await api.app.getBootstrap()).repositories.repos).toHaveLength(2);
  });
  it('keeps clipboard and external-opening actions inside the simulation', async () => {
    const { api, repo } = create();
    await api.app.writeClipboardText(DEMO_REPO);
    expect(repo.clipboard).toBe(DEMO_REPO);
    expect((await api.git.openRepositoryPath({ repoPath: DEMO_REPO })).success).toBe(true);
    expect(repo.lastOpenedPath).toBe(DEMO_REPO);
    expect((await api.app.openExternalUrl(PRACTICE_CLONE_URL)).success).toBe(true);
    expect(repo.lastOpenedUrl).toBe(PRACTICE_CLONE_URL);
    expect((await api.app.openExternalUrl('https://example.com')).success).toBe(false);
    expect(create().repo.clipboard).toBe('');
  });
  it('saves sample icons with a fresh selection version and rejects stale saves', async () => {
    const { api } = create();
    const first = await api.repos.getRepositoryIcon(DEMO_REPO);
    if (!first.success) throw new Error(first.error);
    const choice = { mode: 'manual' as const, path: 'assets/ogc.svg', expectedSelectionVersion: first.data.selectionVersion };
    expect((await api.repos.saveRepositoryIconChoice(DEMO_REPO, choice)).success).toBe(true);
    expect((await api.repos.saveRepositoryIconChoice(DEMO_REPO, choice)).success).toBe(false);
    const saved = await api.repos.getRepositoryIcon(DEMO_REPO);
    expect(saved).toMatchObject({ data: { mode: 'manual', manualPath: 'assets/ogc.svg' } });
    const source = await api.repos.readRepositoryIconSource(DEMO_REPO, 'assets/ogc.svg');
    if (!source.success) throw new Error(source.error);
    expect(source.data.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(source.data.dataUrl.split(',')[1])).toContain('<svg');
  });
});
