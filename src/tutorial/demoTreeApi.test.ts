import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext, TutorialStep } from '@/shared/tutorial/types';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { demoFileVersion } from './demoFileVersions';
import { writeDemoFile } from './demoFiles';
import { demoBlob, demoBlobBytes, getDemoBlob } from './demoBlob';
const context: TutorialLaunchContext = {
  request: { chapterId: 'files-navigation' },
  language: 'en',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const setup = (prepare: TutorialStep['prepare'] = {}) =>
  createDemoApi(context, { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'files-navigation')!.steps[0], scenario: 'clean', prepare });
const state = (repo: ReturnType<typeof setup>['repo']) =>
  structuredClone({
    files: repo.files,
    head: repo.headFiles,
    index: repo.indexFiles,
    directories: repo.directories,
    staged: repo.staged,
    modified: repo.modified,
    untracked: repo.untracked,
    revision: repo.revision,
    versions: repo.fileVersions,
  });

describe('isolated working-directory operations', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'keeps the legitimate filename %s separate from object properties through staging and commit',
    async (path) => {
      const {
        api: { git },
        repo,
      } = setup();
      expect(await git.createWorkingDirectoryFile(path, DEMO_REPO)).toMatchObject({ success: true });
      expect(getDemoBlob(repo.files, path)).toBe('');
      expect(getDemoBlob(repo.indexFiles, path)).toBeUndefined();
      expect(await git.stagePaths([path])).toMatchObject({ success: true });
      expect(getDemoBlob(repo.indexFiles, path)).toBe('');
      expect(await git.createCommit({ title: 'test: track a practice file' })).toMatchObject({ success: true });
      expect(repo.status()).toBe('');
      expect(await git.getRepositoryFilePreview({ repoPath: DEMO_REPO, path, source: 'commit', commitHash: repo.commits[0].hash })).toMatchObject({
        success: true,
        data: { kind: 'text', text: '' },
      });
      expect(Object.getPrototypeOf(repo.files)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(repo.indexFiles)).toBe(Object.prototype);
    },
  );
  it('lists and preserves an empty folder without introducing Git changes', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    const index = structuredClone(repo.indexFiles);
    expect(await git.createWorkingDirectoryFolder('lesson', DEMO_REPO)).toEqual({ success: true, targetPath: 'lesson' });
    expect(await git.listWorkingDirectory(DEMO_REPO, 'lesson')).toEqual({ success: true, data: [] });
    expect(await git.listWorkingDirectoryFolders(DEMO_REPO)).toMatchObject({ success: true, data: expect.arrayContaining(['lesson', 'src']) });
    expect(await git.listWorkingDirectory(DEMO_REPO)).toMatchObject({
      success: true,
      data: expect.arrayContaining([{ path: 'lesson', name: 'lesson', kind: 'directory' }]),
    });
    expect(repo.status()).toBe('');
    expect(repo.indexFiles).toEqual(index);
  });
  it('creates an empty untracked file, edits through the normal CAS API and preserves its folder after deletion', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    await git.createWorkingDirectoryFolder('lesson', DEMO_REPO);
    expect(await git.createWorkingDirectoryFile('lesson/notes.md', DEMO_REPO)).toMatchObject({ success: true });
    const request = { repoPath: DEMO_REPO, path: 'lesson/notes.md', source: 'unstaged' as const };
    const preview = await git.getRepositoryFilePreview(request);
    expect(preview).toMatchObject({ success: true, data: { kind: 'text', text: '', bytes: 0 } });
    if (!preview.success) throw new Error(preview.error);
    expect(await git.saveRepositoryFile({ ...request, expectedVersion: preview.data.version, content: 'Practice\n', encoding: 'utf8' })).toMatchObject({
      success: true,
    });
    expect(repo.untracked.has(request.path)).toBe(true);
    expect(repo.indexFiles[request.path]).toBeUndefined();
    expect(await git.deleteWorkingDirectoryEntry(request.path, DEMO_REPO)).toEqual({ success: true });
    expect(repo.status()).toBe('');
    expect(await git.listWorkingDirectory(DEMO_REPO, 'lesson')).toEqual({ success: true, data: [] });
  });
  it('copies bytes without changing the source version or index, including binary files', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    writeDemoFile(repo, 'binary.bin', demoBlob('\0ÿ\x01È', 'latin1'));
    const version = demoFileVersion(repo, 'unstaged', 'binary.bin');
    const index = structuredClone(repo.indexFiles);
    expect(await git.copyWorkingDirectoryEntry('binary.bin', 'binary-copy.bin', false, DEMO_REPO)).toMatchObject({ success: true });
    expect(demoBlobBytes(repo.files['binary-copy.bin'])).toEqual(new Uint8Array([0, 255, 1, 200]));
    (repo.files['binary-copy.bin'] as { text: string }).text = 'Changed';
    expect(demoBlobBytes(repo.files['binary.bin'])[0]).toBe(0);
    expect(demoFileVersion(repo, 'unstaged', 'binary.bin')).toBe(version);
    expect(repo.indexFiles).toEqual(index);
  });
  it('moves a tracked file while retaining its old index entry and the now-empty source directory', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    const original = repo.files['src/app.ts'],
      index = structuredClone(repo.indexFiles);
    await git.createWorkingDirectoryFolder('lesson', DEMO_REPO);
    expect(await git.moveWorkingDirectoryEntry('src/app.ts', 'lesson/app.ts', false, DEMO_REPO)).toMatchObject({ success: true });
    expect(repo.files['src/app.ts']).toBeUndefined();
    expect(repo.files['lesson/app.ts']).toEqual(original);
    expect(repo.modified.has('src/app.ts')).toBe(true);
    expect(repo.untracked.has('lesson/app.ts')).toBe(true);
    expect(repo.indexFiles).toEqual(index);
    expect(await git.listWorkingDirectory(DEMO_REPO, 'src')).toEqual({ success: true, data: [] });
  });
  it('copies nested and empty directories, then replaces the complete destination only when authorized', async () => {
    const {
      api: { git },
      repo,
    } = setup({ directories: ['lesson/empty', 'target/old-empty'] });
    await git.createWorkingDirectoryFile('lesson/note.txt', DEMO_REPO);
    await git.createWorkingDirectoryFile('target/old.txt', DEMO_REPO);
    const before = state(repo);
    expect(await git.copyWorkingDirectoryEntry('lesson', 'target', false, DEMO_REPO)).toMatchObject({ success: false });
    expect(state(repo)).toEqual(before);
    expect(await git.copyWorkingDirectoryEntry('lesson', 'target', true, DEMO_REPO)).toMatchObject({ success: true });
    expect(repo.files['target/note.txt']).toBe('');
    expect(repo.files['target/old.txt']).toBeUndefined();
    expect(repo.directories.has('target/empty')).toBe(true);
    expect(repo.directories.has('target/old-empty')).toBe(false);
    expect(repo.directories.has('lesson/empty')).toBe(true);
  });
  it('invalidates an overwritten file version even when the copied bytes are identical', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    await git.copyWorkingDirectoryEntry('README.md', 'copy.md', false, DEMO_REPO);
    const version = demoFileVersion(repo, 'unstaged', 'copy.md'),
      index = demoFileVersion(repo, 'staged', 'README.md');
    await git.copyWorkingDirectoryEntry('README.md', 'copy.md', true, DEMO_REPO);
    expect(demoFileVersion(repo, 'unstaged', 'copy.md')).not.toBe(version);
    expect(demoFileVersion(repo, 'staged', 'README.md')).toBe(index);
  });
  it.each(['../escape', '/absolute', 'C:/outside', 'a\\b', '.git/config', 'nested/.GIT/index', 'a//b', 'name.', 'name ', 'NUL', 'con.txt', 'COM1.log', 'a\0b'])(
    'rejects unsafe or aliased path %j atomically',
    async (path) => {
      const {
        api: { git },
        repo,
      } = setup();
      const before = state(repo);
      expect(await git.createWorkingDirectoryFile(path, DEMO_REPO)).toMatchObject({ success: false });
      expect(await git.createWorkingDirectoryFolder(path, DEMO_REPO)).toMatchObject({ success: false });
      expect(await git.copyWorkingDirectoryEntry('README.md', path, true, DEMO_REPO)).toMatchObject({ success: false });
      expect(await git.deleteWorkingDirectoryEntry(path, DEMO_REPO)).toMatchObject({ success: false });
      expect(state(repo)).toEqual(before);
    },
  );
  it('rejects a missing or file-valued parent, collisions, a missing source and recursive transfers', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    const before = state(repo);
    expect(await git.createWorkingDirectoryFile('missing/file.txt', DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.createWorkingDirectoryFile('README.md/file.txt', DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.createWorkingDirectoryFile('readme.md', DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.copyWorkingDirectoryEntry('missing.txt', 'copy.txt', false, DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.copyWorkingDirectoryEntry('src', 'src/nested', false, DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.moveWorkingDirectoryEntry('src', 'src/nested', false, DEMO_REPO)).toMatchObject({ success: false });
    expect(state(repo)).toEqual(before);
  });
  it('preserves empty directories across repository switches and rejects a foreign repository', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    await git.createWorkingDirectoryFolder('empty', DEMO_REPO);
    repo.registerProject(DEMO_SECOND_REPO, { 'notes.md': 'Other project' }, true);
    repo.selectProject(DEMO_SECOND_REPO);
    expect(repo.directories.has('empty')).toBe(false);
    const before = state(repo);
    expect(await git.listWorkingDirectory(DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.createWorkingDirectoryFile('foreign.txt', DEMO_REPO)).toMatchObject({ success: false });
    expect(state(repo)).toEqual(before);
    repo.selectProject(DEMO_REPO);
    expect(repo.directories.has('empty')).toBe(true);
  });
  it('restores parent directories when Git restores a deleted tracked file', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    const original = repo.files['src/app.ts'];
    await git.deleteWorkingDirectoryEntry('src', DEMO_REPO);
    expect(repo.directories.has('src')).toBe(false);
    expect(repo.modified.has('src/app.ts')).toBe(true);
    expect(await git.runGitCommand('checkout', '--', 'src/app.ts')).toMatchObject({ success: true });
    expect(repo.files['src/app.ts']).toEqual(original);
    expect(repo.directories.has('src')).toBe(true);
    expect(repo.status()).toBe('');
  });
});
