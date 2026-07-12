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

  it('deletes only a file in the active repository', async () => {
    const deleteRepoFileAtPath = vi.fn().mockResolvedValue(undefined);
    registerGitFileHandlers({ gitService: { getRepoPath: () => repoPath, files: { deleteRepoFileAtPath } } as any });

    const result = await handlers.get(IpcChannel.GitDeleteRepoFile)!({}, 'NOTICE', repoPath);

    expect(result).toEqual({ success: true });
    expect(deleteRepoFileAtPath).toHaveBeenCalledWith(repoPath, 'NOTICE');
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
});
