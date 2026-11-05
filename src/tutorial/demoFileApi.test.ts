import { describe, expect, it } from 'vitest';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import type { TutorialLaunchContext, TutorialStep } from '@/shared/tutorial/types';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';

const context: TutorialLaunchContext = {
  request: { chapterId: 'files-edit' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = () =>
  createDemoApi(context, { id: 'file', title: ['', ''], description: ['', ''], target: 'body', area: 'repo', scenario: 'mixed' } satisfies TutorialStep);
const file: RepositoryFileContextDto = { repoPath: DEMO_REPO, path: 'README.md', source: 'unstaged' };

describe('source-bound practice file editing', () => {
  it('saves UTF-8 worktree text and reports byte length without changing index or HEAD', async () => {
    const { repo, api } = create();
    const preview = await api.git.getRepositoryFilePreview(file);
    const head = repo.headFiles['README.md'],
      index = repo.indexFiles['README.md'];
    const content = 'Ein Entwurf 📝\n';
    expect(preview.success && preview.data.editable).toBe(true);
    const saved = await api.git.saveRepositoryFile({ ...file, expectedVersion: preview.success ? preview.data.version : '', encoding: 'utf8', content });
    expect(saved.success && saved.data.bytes).toBe(new TextEncoder().encode(content).byteLength);
    expect(repo.files['README.md']).toBe(content);
    expect(repo.indexFiles['README.md']).toBe(index);
    expect(repo.headFiles['README.md']).toBe(head);
    expect(repo.modified.has('README.md')).toBe(true);
  });
  it('edits the index independently of the worktree', async () => {
    const { repo, api } = create();
    const staged = { ...file, source: 'staged' as const };
    const before = await api.git.getRepositoryFilePreview(staged);
    const work = repo.files['README.md'];
    expect(before.success && before.data.editable).toBe(true);
    expect(
      (await api.git.saveRepositoryFile({ ...staged, expectedVersion: before.success ? before.data.version : '', encoding: 'utf8', content: 'Index only\n' }))
        .success,
    ).toBe(true);
    expect(repo.indexFiles['README.md']).toBe('Index only\n');
    expect(repo.files['README.md']).toBe(work);
    expect(repo.status()).toContain('MM README.md');
  });
  it('refuses cross-path, cross-source, and stale-repository tokens', async () => {
    const { repo, api } = create();
    const before = await api.git.getRepositoryFilePreview(file);
    const request = { ...file, expectedVersion: before.success ? before.data.version : '', encoding: 'utf8' as const, content: 'Wrong place\n' };
    const original = structuredClone(repo.files);
    expect((await api.git.saveRepositoryFile({ ...request, path: 'src/app.ts' })).success).toBe(false);
    expect((await api.git.saveRepositoryFile({ ...request, source: 'staged' })).success).toBe(false);
    expect((await api.git.saveRepositoryFile({ ...request, repoPath: DEMO_SECOND_REPO })).success).toBe(false);
    expect(repo.files).toEqual(original);
  });
  it('allows unrelated updates but detects a file changed away and back again', async () => {
    const { repo, api } = create();
    const before = await api.git.getRepositoryFilePreview(file);
    const request = { ...file, expectedVersion: before.success ? before.data.version : '', encoding: 'utf8' as const, content: 'Saved draft\n' };
    repo.mark('setting-changed');
    await api.git.writeRepoFile('notes.txt', 'Unrelated edit\n');
    expect((await api.git.saveRepositoryFile(request)).success).toBe(true);
    const saved = await api.git.getRepositoryFilePreview(file);
    const original = repo.files['README.md'];
    await api.git.writeRepoFile('README.md', 'Intermediate contents\n');
    await api.git.writeRepoFile('README.md', original);
    expect((await api.git.saveRepositoryFile({ ...request, expectedVersion: saved.success ? saved.data.version : '' })).success).toBe(false);
    expect(repo.files['README.md']).toBe(original);
  });
  it('invalidates an index snapshot after stage and unstage, and preserves it across project switches', async () => {
    const { api } = create();
    const staged = { ...file, source: 'staged' as const };
    const before = await api.git.getRepositoryFilePreview(staged);
    await api.git.stagePaths(['README.md']);
    await api.git.runGitCommand('reset', 'HEAD', '--', 'README.md');
    const request = { ...staged, expectedVersion: before.success ? before.data.version : '', encoding: 'utf8' as const, content: 'Index draft\n' };
    expect((await api.git.saveRepositoryFile(request)).success).toBe(false);
    const current = await api.git.getRepositoryFilePreview(staged);
    await api.git.setRepoPath(DEMO_SECOND_REPO);
    expect((await api.git.saveRepositoryFile(request)).success).toBe(false);
    await api.git.setRepoPath(DEMO_REPO);
    expect((await api.git.saveRepositoryFile({ ...request, expectedVersion: current.success ? current.data.version : '' })).success).toBe(true);
  });
  it('keeps committed versions read-only and rejects unknown commits', async () => {
    const { repo, api } = create();
    const committed = { ...file, source: 'commit' as const, commitHash: repo.commits[0].hash };
    const preview = await api.git.getRepositoryFilePreview(committed);
    expect(preview.success && preview.data.editable).toBe(false);
    expect(
      (
        await api.git.saveRepositoryFile({
          ...committed,
          expectedVersion: preview.success ? preview.data.version : '',
          content: 'Forbidden\n',
          encoding: 'utf8',
        })
      ).success,
    ).toBe(false);
    expect((await api.git.getRepositoryFilePreview({ ...committed, commitHash: 'missing' })).success).toBe(false);
  });
  it('distinguishes missing and binary files and does not create them through editor save', async () => {
    const { api } = create();
    expect(await api.git.getRepositoryFilePreview({ ...file, path: 'missing.txt' })).toMatchObject({
      success: true,
      data: { kind: 'missing', editable: false, bytes: 0 },
    });
    await api.git.writeRepoFile('binary.bin', '\0data');
    const preview = await api.git.getRepositoryFilePreview({ ...file, path: 'binary.bin' });
    expect(preview).toMatchObject({ success: true, data: { kind: 'binary', editable: false } });
    expect(
      (
        await api.git.saveRepositoryFile({
          ...file,
          path: 'binary.bin',
          expectedVersion: preview.success ? preview.data.version : '',
          content: 'text',
          encoding: 'utf8',
        })
      ).success,
    ).toBe(false);
  });
  it('reads Markdown from its selected source and refuses inactive-repository legacy writes', async () => {
    const { repo, api } = create();
    expect(await api.git.getMarkdownPreviewFile({ ...file, source: 'staged' })).toMatchObject({ success: true, data: { text: repo.indexFiles['README.md'] } });
    expect((await api.git.writeRepoFile('README.md', 'Wrong repository', DEMO_SECOND_REPO)).success).toBe(false);
    expect((await api.git.readRepoFile('README.md', DEMO_SECOND_REPO)).success).toBe(false);
    expect((await api.git.getWorkingDirectoryPreview('README.md', DEMO_SECOND_REPO)).success).toBe(false);
  });
});
