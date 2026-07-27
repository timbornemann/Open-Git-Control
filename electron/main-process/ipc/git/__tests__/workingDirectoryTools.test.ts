import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerWorkingDirectoryToolsHandlers } from '../workingDirectoryTools';

const { createEntrySafelyMock, handleMock } = vi.hoisted(() => ({ createEntrySafelyMock: vi.fn(), handleMock: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
}));
vi.mock('../workingDirectoryFileCreation', () => ({
  createWorkingDirectoryEntrySafely: createEntrySafelyMock,
}));

describe('working-directory tool handlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  let repoPath = '';

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tools-'));
    handlers.clear();
    handleMock.mockReset();
    createEntrySafelyMock.mockReset();
    createEntrySafelyMock.mockImplementation((targetPath: string) => fs.mkdirSync(targetPath));
    handleMock.mockImplementation((channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler));
    const workingDirectoryPath = (_repoPath: string, value: unknown, label: string, allowMissing = false) => {
      const relativePath = String(value ?? '');
      if (!relativePath) throw new Error(`${label} is required.`);
      const resolvedPath = path.resolve(repoPath, relativePath);
      const relative = path.relative(repoPath, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes the repository.`);
      if (!allowMissing && !fs.existsSync(resolvedPath)) throw new Error(`${label} does not exist.`);
      return resolvedPath;
    };
    registerWorkingDirectoryToolsHandlers({
      gitService: { getRepoPath: () => repoPath } as any,
      workingDirectoryPath,
    });
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('renames overlapping targets through temporary paths', async () => {
    fs.writeFileSync(path.join(repoPath, 'first.txt'), 'first');
    fs.writeFileSync(path.join(repoPath, 'second.txt'), 'second');

    const result = await handlers.get(IpcChannel.GitApplyWorkingDirectoryMoves)?.(
      {},
      {
        moves: [
          { sourcePath: 'first.txt', targetPath: 'second.txt' },
          { sourcePath: 'second.txt', targetPath: 'first.txt' },
        ],
        createParentFolders: false,
      },
      repoPath,
    );

    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(path.join(repoPath, 'first.txt'), 'utf8')).toBe('second');
    expect(fs.readFileSync(path.join(repoPath, 'second.txt'), 'utf8')).toBe('first');
  });

  it('creates requested type folders before moving files', async () => {
    fs.writeFileSync(path.join(repoPath, 'photo.jpeg'), 'photo');

    await expect(
      handlers.get(IpcChannel.GitApplyWorkingDirectoryMoves)?.(
        {},
        { moves: [{ sourcePath: 'photo.jpeg', targetPath: 'images/photo.jpeg' }], createParentFolders: true },
        repoPath,
      ),
    ).resolves.toEqual({ success: true });

    expect(createEntrySafelyMock).toHaveBeenCalledWith(path.join(repoPath, 'images'), 'folder');
    expect(fs.readFileSync(path.join(repoPath, 'images', 'photo.jpeg'), 'utf8')).toBe('photo');
  });

  it('rejects target collisions before changing any selected file', async () => {
    fs.writeFileSync(path.join(repoPath, 'photo.jpeg'), 'jpeg');
    fs.writeFileSync(path.join(repoPath, 'photo.jpg'), 'jpg');

    await expect(
      handlers.get(IpcChannel.GitApplyWorkingDirectoryMoves)?.(
        {},
        { moves: [{ sourcePath: 'photo.jpeg', targetPath: 'photo.jpg' }], createParentFolders: false },
        repoPath,
      ),
    ).resolves.toEqual({ success: false, error: 'Target already exists: photo.jpg' });

    expect(fs.readFileSync(path.join(repoPath, 'photo.jpeg'), 'utf8')).toBe('jpeg');
    expect(fs.readFileSync(path.join(repoPath, 'photo.jpg'), 'utf8')).toBe('jpg');
  });

  it('lists repository folders without exposing Git metadata', async () => {
    fs.mkdirSync(path.join(repoPath, 'zeta'));
    fs.mkdirSync(path.join(repoPath, 'alpha', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, '.git', 'objects'), { recursive: true });

    await expect(handlers.get(IpcChannel.GitListWorkingDirectoryFolders)?.({}, repoPath, '')).resolves.toEqual({
      success: true,
      data: ['alpha', 'zeta'],
    });
    await expect(handlers.get(IpcChannel.GitListWorkingDirectoryFolders)?.({}, repoPath, 'alpha')).resolves.toEqual({
      success: true,
      data: ['alpha/nested'],
    });
  });

  it('finds top-level empty trees and deletes only folders that are still empty', async () => {
    fs.mkdirSync(path.join(repoPath, 'empty', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'kept'));
    fs.writeFileSync(path.join(repoPath, 'kept', 'content.txt'), 'content');

    await expect(handlers.get(IpcChannel.GitFindEmptyWorkingDirectoryFolders)?.({}, [], repoPath)).resolves.toEqual({
      success: true,
      data: ['empty'],
    });
    await expect(handlers.get(IpcChannel.GitDeleteEmptyWorkingDirectoryFolders)?.({}, ['empty'], repoPath)).resolves.toEqual({ success: true });
    expect(fs.existsSync(path.join(repoPath, 'empty'))).toBe(false);

    await expect(handlers.get(IpcChannel.GitDeleteEmptyWorkingDirectoryFolders)?.({}, ['kept'], repoPath)).resolves.toEqual({
      success: false,
      error: 'Folder is no longer empty: kept',
    });
    expect(fs.readFileSync(path.join(repoPath, 'kept', 'content.txt'), 'utf8')).toBe('content');
  });

  it('creates a standard stored ZIP archive containing selected files and folders', async () => {
    fs.writeFileSync(path.join(repoPath, 'alpha.txt'), 'alpha');
    fs.mkdirSync(path.join(repoPath, 'folder'));
    fs.writeFileSync(path.join(repoPath, 'folder', 'beta.txt'), 'beta');

    await expect(
      handlers.get(IpcChannel.GitCreateWorkingDirectoryArchive)?.({}, { sourcePaths: ['alpha.txt', 'folder'], targetPath: 'bundle.zip' }, repoPath),
    ).resolves.toEqual({ success: true, targetPath: 'bundle.zip' });

    const archive = fs.readFileSync(path.join(repoPath, 'bundle.zip'));
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0);
    expect(archive.includes(Buffer.from('alpha.txt'))).toBe(true);
    expect(archive.includes(Buffer.from('folder/'))).toBe(true);
    expect(archive.includes(Buffer.from('folder/beta.txt'))).toBe(true);
    expect(archive.includes(Buffer.from('alpha'))).toBe(true);
    expect(archive.includes(Buffer.from('beta'))).toBe(true);
  });
});
