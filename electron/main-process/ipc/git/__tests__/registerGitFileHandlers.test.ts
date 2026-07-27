import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerGitFileHandlers } from '../registerGitFileHandlers';

const { handleMock, openPathMock, showItemInFolderMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  openPathMock: vi.fn(),
  showItemInFolderMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openPath: openPathMock, showItemInFolder: showItemInFolderMock },
}));

describe('registerGitFileHandlers repository path opening', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  let repoPath = '';

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-open-path-'));
    fs.mkdirSync(path.join(repoPath, 'src'));
    fs.writeFileSync(path.join(repoPath, 'src', 'app.ts'), 'export {};\n');
    handlers.clear();
    handleMock.mockReset();
    openPathMock.mockReset().mockResolvedValue('');
    showItemInFolderMock.mockReset();
    handleMock.mockImplementation((channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler));
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath } as any });
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('reveals only an existing repository-relative path', async () => {
    const result = await handlers.get(IpcChannel.GitOpenRepositoryPath)!({}, { path: 'src/app.ts', action: 'reveal', repoPath });

    expect(result).toEqual({ success: true });
    expect(showItemInFolderMock).toHaveBeenCalledWith(fs.realpathSync(path.join(repoPath, 'src', 'app.ts')));
  });

  it('lists only the requested working-directory level', async () => {
    fs.mkdirSync(path.join(repoPath, 'src', 'nested'));
    fs.writeFileSync(path.join(repoPath, 'src', 'nested', 'deep.ts'), 'export {};\n');
    fs.writeFileSync(path.join(repoPath, '.hidden'), 'visible\n');
    fs.mkdirSync(path.join(repoPath, '.github'));
    fs.mkdirSync(path.join(repoPath, '.git'));

    const rootResult = await handlers.get(IpcChannel.GitListWorkingDirectory)!({}, repoPath, '');
    const sourceResult = await handlers.get(IpcChannel.GitListWorkingDirectory)!({}, repoPath, 'src');

    expect(rootResult).toEqual({
      success: true,
      data: expect.arrayContaining([
        { path: '.github', name: '.github', kind: 'directory' },
        { path: '.hidden', name: '.hidden', kind: 'file', bytes: expect.any(Number) },
        { path: 'src', name: 'src', kind: 'directory' },
      ]),
    });
    expect(rootResult.data).not.toContainEqual(expect.objectContaining({ name: '.git' }));
    expect(sourceResult).toEqual({
      success: true,
      data: expect.arrayContaining([
        { path: 'src/app.ts', name: 'app.ts', kind: 'file', bytes: expect.any(Number) },
        { path: 'src/nested', name: 'nested', kind: 'directory' },
      ]),
    });
  });

  it('rejects a working-directory level outside the active repository', async () => {
    const result = await handlers.get(IpcChannel.GitListWorkingDirectory)!({}, repoPath, '../outside');

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('repository-relative') });
  });

  it('creates an empty file without overwriting an existing entry', async () => {
    const firstResult = await handlers.get(IpcChannel.GitCreateWorkingDirectoryFile)!({}, 'src/new-file.ts', repoPath);

    expect(firstResult).toEqual({ success: true, targetPath: 'src/new-file.ts' });
    expect(fs.readFileSync(path.join(repoPath, 'src', 'new-file.ts'), 'utf8')).toBe('');

    fs.writeFileSync(path.join(repoPath, 'src', 'new-file.ts'), 'keep this content');
    const duplicateResult = await handlers.get(IpcChannel.GitCreateWorkingDirectoryFile)!({}, 'src/new-file.ts', repoPath);

    expect(duplicateResult).toMatchObject({ success: false, error: expect.stringContaining('EEXIST') });
    expect(fs.readFileSync(path.join(repoPath, 'src', 'new-file.ts'), 'utf8')).toBe('keep this content');
  });

  it('creates a folder without overwriting an existing entry', async () => {
    const firstResult = await handlers.get(IpcChannel.GitCreateWorkingDirectoryFolder)!({}, 'src/new-folder', repoPath);

    expect(firstResult).toEqual({ success: true, targetPath: 'src/new-folder' });
    expect(fs.statSync(path.join(repoPath, 'src', 'new-folder')).isDirectory()).toBe(true);

    const duplicateResult = await handlers.get(IpcChannel.GitCreateWorkingDirectoryFolder)!({}, 'src/new-folder', repoPath);

    expect(duplicateResult).toMatchObject({ success: false, error: expect.stringContaining('EEXIST') });
  });

  it('loads a large image only after the caller explicitly requests it', async () => {
    const imagePath = path.join(repoPath, 'src', 'large.png');
    fs.writeFileSync(imagePath, Buffer.alloc(2 * 1024 * 1024 + 1));

    const deferredResult = await handlers.get(IpcChannel.GitGetWorkingDirectoryPreview)!({}, 'src/large.png', repoPath);
    expect(deferredResult).toEqual({
      success: true,
      data: expect.objectContaining({ kind: 'binary', reason: 'tooLarge', mimeType: 'image/png', canLoadImage: true }),
    });

    const imageResult = await handlers.get(IpcChannel.GitGetWorkingDirectoryPreview)!({}, 'src/large.png', repoPath, true);
    expect(imageResult).toEqual({
      success: true,
      data: expect.objectContaining({ kind: 'image', mimeType: 'image/png', bytes: 2 * 1024 * 1024 + 1 }),
    });
  });

  it('returns text encoding and modification metadata with a text preview', async () => {
    const targetPath = path.join(repoPath, 'src', 'bom.txt');
    fs.writeFileSync(targetPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello\r\n')]));

    const result = await handlers.get(IpcChannel.GitGetWorkingDirectoryPreview)!({}, 'src/bom.txt', repoPath);

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        kind: 'text',
        text: 'hello\r\n',
        encoding: 'utf8-bom',
        modifiedAt: expect.any(String),
      }),
    });
  });

  it('returns filesystem metadata and Git history summary for a working-directory file', async () => {
    const runCommandAtPath = vi.fn(async (_requestedRepoPath: string, args: string[]) => {
      if (args[0] === 'ls-files') return '100644 deadbeef 0\tsrc/app.ts\n';
      if (args[0] === 'status') return ' M src/app.ts\n';
      if (args[0] === 'log') {
        return (
          'newesthash\x1fnewest\x1fAda\x1f2026-07-26T12:00:00+00:00\x1fUpdate app\x00' +
          'oldesthash\x1foldest\x1fLin\x1f2026-07-01T08:30:00+00:00\x1fAdd app\x00'
        );
      }
      throw new Error(`Unexpected command: ${args[0]}`);
    });
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath, runCommandAtPath } as any });

    const result = await handlers.get(IpcChannel.GitGetWorkingDirectoryFileInfo)!({}, 'src/app.ts', repoPath);

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        path: 'src/app.ts',
        name: 'app.ts',
        extension: 'ts',
        bytes: expect.any(Number),
        readOnly: false,
        hashes: {
          sha256: '8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881',
          sha1: 'b878c11a77128e74c3cf15c93ef2ceddf2aa0b38',
          md5: 'e2ebd7ddedcadeeadbf819c35985c768',
        },
        git: {
          tracked: true,
          ignored: false,
          staged: false,
          modified: true,
          conflicted: false,
          historyCount: 2,
          firstCommit: {
            hash: 'oldesthash',
            abbrevHash: 'oldest',
            author: 'Lin',
            date: '2026-07-01T08:30:00+00:00',
            subject: 'Add app',
          },
          latestCommit: {
            hash: 'newesthash',
            abbrevHash: 'newest',
            author: 'Ada',
            date: '2026-07-26T12:00:00+00:00',
            subject: 'Update app',
          },
        },
      }),
    });
    expect(runCommandAtPath).toHaveBeenCalledWith(repoPath, expect.arrayContaining(['log', '--follow']));
  });

  it('still returns file information for a repository without commits', async () => {
    const runCommandAtPath = vi.fn(async (_requestedRepoPath: string, args: string[]) => {
      if (args[0] === 'ls-files' || args[0] === 'status') return '';
      if (args[0] === 'log') throw new Error("fatal: your current branch 'main' does not have any commits yet");
      throw new Error(`Unexpected command: ${args[0]}`);
    });
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath, runCommandAtPath } as any });

    const result = await handlers.get(IpcChannel.GitGetWorkingDirectoryFileInfo)!({}, 'src/app.ts', repoPath);

    expect(result).toMatchObject({
      success: true,
      data: {
        git: {
          tracked: false,
          historyCount: 0,
          firstCommit: null,
          latestCommit: null,
        },
      },
    });
    expect(result.data.git.error).toBeUndefined();
  });

  it('deletes only a file in the active repository', async () => {
    const deleteRepoFileAtPath = vi.fn().mockResolvedValue(undefined);
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath, files: { deleteRepoFileAtPath } } as any });

    const result = await handlers.get(IpcChannel.GitDeleteRepoFile)!({}, 'NOTICE', repoPath);

    expect(result).toEqual({ success: true });
    expect(deleteRepoFileAtPath).toHaveBeenCalledWith(repoPath, 'NOTICE');
  });

  it('passes an explicitly requested target encoding to the repository writer', async () => {
    const writeRepoFileAtPath = vi.fn().mockResolvedValue(undefined);
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath, files: { writeRepoFileAtPath } } as any });

    const result = await handlers.get(IpcChannel.GitWriteRepoFile)!({}, 'src/app.ts', 'café', repoPath, 'latin1');

    expect(result).toEqual({ success: true });
    expect(writeRepoFileAtPath).toHaveBeenCalledWith(repoPath, 'src/app.ts', 'café', 'latin1');
  });

  it('rejects deletion paths that leave the repository', async () => {
    const deleteRepoFileAtPath = vi.fn().mockRejectedValue(new Error('File path must be repository-relative.'));
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath, files: { deleteRepoFileAtPath } } as any });

    const result = await handlers.get(IpcChannel.GitDeleteRepoFile)!({}, '../NOTICE', repoPath);

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('repository-relative') });
    expect(deleteRepoFileAtPath).toHaveBeenCalledWith(repoPath, '../NOTICE');
  });

  it('opens the repository root when no relative path is supplied', async () => {
    const result = await handlers.get(IpcChannel.GitOpenRepositoryPath)!({}, { action: 'open', repoPath });

    expect(result).toEqual({ success: true });
    expect(openPathMock).toHaveBeenCalledWith(fs.realpathSync(repoPath));
  });

  it('opens a stored inactive repository root without changing the active repository', async () => {
    const inactiveActiveRepoPath = path.join(repoPath, 'another-repository');
    registerGitFileHandlers({
      gitService: { getRepoPath: () => inactiveActiveRepoPath } as any,
      readStoredRepoPaths: () => [repoPath],
    });

    const result = await handlers.get(IpcChannel.GitOpenRepositoryPath)!({}, { action: 'open', repoPath });

    expect(result).toEqual({ success: true });
    expect(openPathMock).toHaveBeenCalledWith(fs.realpathSync(repoPath));
  });

  it('does not authorize a file inside an inactive stored repository', async () => {
    const inactiveActiveRepoPath = path.join(repoPath, 'another-repository');
    registerGitFileHandlers({
      gitService: { getRepoPath: () => inactiveActiveRepoPath } as any,
      readStoredRepoPaths: () => [repoPath],
    });

    const result = await handlers.get(IpcChannel.GitOpenRepositoryPath)!({}, { path: 'src/app.ts', action: 'reveal', repoPath });

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('active repository') });
    expect(showItemInFolderMock).not.toHaveBeenCalled();
  });

  it('rejects traversal before interacting with the operating system', async () => {
    const result = await handlers.get(IpcChannel.GitOpenRepositoryPath)!({}, { path: '../outside.txt', action: 'reveal', repoPath });

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('repository-relative') });
    expect(showItemInFolderMock).not.toHaveBeenCalled();
    expect(openPathMock).not.toHaveBeenCalled();
  });

  it('reveals an existing parent when a historical file is absent from the current checkout', async () => {
    const result = await handlers.get(IpcChannel.GitOpenRepositoryPath)!({}, { path: 'src/deleted.ts', action: 'reveal', repoPath });

    expect(result).toEqual({ success: true });
    expect(openPathMock).toHaveBeenCalledWith(fs.realpathSync(path.join(repoPath, 'src')));
  });

  it('adds an ignore rule by replacing a regular .gitignore atomically', async () => {
    registerGitFileHandlers({
      gitService: { getRepoPath: () => repoPath, runCommandAtPath: vi.fn().mockResolvedValue(repoPath) } as any,
    });

    const result = await handlers.get(IpcChannel.GitAddIgnoreRule)!({}, 'dist/', repoPath);

    expect(result).toEqual({ success: true, added: true, pattern: 'dist/' });
    expect(fs.readFileSync(path.join(repoPath, '.gitignore'), 'utf8')).toBe('dist/\n');
  });

  it('rejects a hard-linked .gitignore without changing its linked target', async () => {
    const metadataPath = path.join(repoPath, '.git', 'config');
    fs.mkdirSync(path.dirname(metadataPath));
    fs.writeFileSync(metadataPath, '[core]\nrepositoryformatversion = 0\n');
    fs.linkSync(metadataPath, path.join(repoPath, '.gitignore'));
    registerGitFileHandlers({
      gitService: { getRepoPath: () => repoPath, runCommandAtPath: vi.fn().mockResolvedValue(repoPath) } as any,
    });

    const result = await handlers.get(IpcChannel.GitAddIgnoreRule)!({}, 'dist/', repoPath);

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('hard links') });
    expect(fs.readFileSync(metadataPath, 'utf8')).toBe('[core]\nrepositoryformatversion = 0\n');
  });

  it('re-authorizes the active repository after resolving the Git top level', async () => {
    let activeRepository = repoPath;
    const otherRepository = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-other-repository-'));
    registerGitFileHandlers({
      gitService: {
        getRepoPath: () => activeRepository,
        runCommandAtPath: vi.fn(async () => {
          activeRepository = otherRepository;
          return repoPath;
        }),
      } as any,
    });

    const result = await handlers.get(IpcChannel.GitAddIgnoreRule)!({}, 'dist/', repoPath);

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('active repository') });
    expect(fs.existsSync(path.join(repoPath, '.gitignore'))).toBe(false);
    fs.rmSync(otherRepository, { recursive: true, force: true });
  });
});
