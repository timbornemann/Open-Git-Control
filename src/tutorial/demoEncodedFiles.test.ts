import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { demoBlob, readDemoBlob } from './demoBlob';
import { applyDemoPatch } from './demoPatch';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
const context: TutorialLaunchContext = {
  request: { chapterId: 'editor-encoding' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = () => createDemoApi(context, { id: 'file', title: ['', ''], description: ['', ''], target: 'body', area: 'repo', scenario: 'encoding' });
const file = { repoPath: DEMO_REPO, path: 'README.md', source: 'unstaged' as const };
describe('source-bound encoded practice files', () => {
  it('tracks encoding-only edits and carries their bytes through staging, commits and project switches', async () => {
    const { api, repo } = create();
    const initial = await api.git.getRepositoryFilePreview(file);
    const content = 'Café\n  OGC\tTutor\n';
    const saved = await api.git.saveRepositoryFile({ ...file, content, encoding: 'utf8-bom', expectedVersion: initial.success ? initial.data.version : '' });
    expect(saved.success).toBe(true);
    expect([...repo.modified]).toEqual(['README.md']);
    expect(readDemoBlob(repo.indexFiles['README.md']).encoding).toBe('utf8');
    expect(
      (await api.git.saveRepositoryFile({ ...file, content, encoding: 'utf8', expectedVersion: initial.success ? initial.data.version : '' })).success,
    ).toBe(false);
    await api.git.stagePaths(['README.md']);
    expect(repo.modified.size).toBe(0);
    expect(readDemoBlob(repo.indexFiles['README.md']).encoding).toBe('utf8-bom');
    await api.git.createCommit({ title: 'docs: preserve bytes' });
    expect(await api.git.getRepositoryFilePreview({ ...file, source: 'commit', commitHash: repo.commits[0].hash })).toMatchObject({
      success: true,
      data: { encoding: 'utf8-bom', text: content, bytes: new TextEncoder().encode(content).length + 3, editable: false },
    });
    repo.selectProject(DEMO_SECOND_REPO);
    repo.selectProject(DEMO_REPO);
    expect(readDemoBlob(repo.files['README.md']).encoding).toBe('utf8-bom');
  });
  it('keeps worktree and index encodings separate and restores the original bytes on discard', async () => {
    const { api, repo } = create();
    repo.files['README.md'] = demoBlob('Café\r\n', 'latin1');
    await api.git.stagePaths(['README.md']);
    repo.files['README.md'] = demoBlob('Café\r\n', 'utf16be');
    expect(await api.git.getRepositoryFilePreview(file)).toMatchObject({ success: true, data: { kind: 'text', encoding: 'utf16be' } });
    expect(repo.diff()).toContain('Binary files');
    expect(repo.diffCommand(['--numstat'])).toContain('-\t-\tREADME.md');
    expect(applyDemoPatch(repo, 'not a patch').success).toBe(false);
    await api.git.runGitCommand('checkout', '--', 'README.md');
    expect(readDemoBlob(repo.files['README.md']).encoding).toBe('latin1');
    await api.git.runGitCommand('reset', 'HEAD', '--', 'README.md');
    expect(readDemoBlob(repo.indexFiles['README.md']).encoding).toBe('utf8');
    const encoded = repo.files['README.md'];
    expect(applyDemoPatch(repo, repo.diff(), { reverse: true }).success).toBe(false);
    expect(repo.files['README.md']).toBe(encoded);
  });
  it('refuses an unrepresentable save without changing data, token or repository status', async () => {
    const { api, repo } = create();
    const before = await api.git.getRepositoryFilePreview(file);
    const result = await api.git.saveRepositoryFile({ ...file, content: '🚀', encoding: 'latin1', expectedVersion: before.success ? before.data.version : '' });
    expect(result.success).toBe(false);
    expect(await api.git.getRepositoryFilePreview(file)).toEqual(before);
    expect(repo.status()).toBe('');
  });
});
