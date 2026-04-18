import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDialogHandlers } from '../registerDialogHandlers';

const { handleMock, showOpenDialogMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  showOpenDialogMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
}));

describe('registerDialogHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    showOpenDialogMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  it('checks if selected path is a git repo without mutating the active repo path', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['D:/tmp/example'] });
    const gitService = {
      runCommandAtPath: vi.fn().mockResolvedValue('true'),
      setRepoPath: vi.fn(),
      checkIsRepo: vi.fn(),
    } as any;

    registerDialogHandlers({ gitService });

    const handler = handlers.get('dialog:openDirectory');
    expect(handler).toBeTruthy();

    const result = await handler!();
    expect(result).toEqual({ path: 'D:/tmp/example', isRepo: true });
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith('D:/tmp/example', ['rev-parse', '--is-inside-work-tree']);
    expect(gitService.setRepoPath).not.toHaveBeenCalled();
    expect(gitService.checkIsRepo).not.toHaveBeenCalled();
  });

  it('returns a clean clone directory title and keeps isRepo false when probe fails', async () => {
    showOpenDialogMock
      .mockResolvedValueOnce({ canceled: false, filePaths: ['D:/tmp/not-a-repo'] })
      .mockResolvedValueOnce({ canceled: false, filePaths: ['D:/tmp/clone-target'] });

    const gitService = {
      runCommandAtPath: vi.fn().mockRejectedValue(new Error('not a repo')),
      setRepoPath: vi.fn(),
      checkIsRepo: vi.fn(),
    } as any;

    registerDialogHandlers({ gitService });

    const openDirectoryHandler = handlers.get('dialog:openDirectory');
    const selectDirectoryHandler = handlers.get('dialog:selectDirectory');
    expect(openDirectoryHandler).toBeTruthy();
    expect(selectDirectoryHandler).toBeTruthy();

    const openResult = await openDirectoryHandler!();
    expect(openResult).toEqual({ path: 'D:/tmp/not-a-repo', isRepo: false });

    const selectResult = await selectDirectoryHandler!();
    expect(selectResult).toBe('D:/tmp/clone-target');
    expect(showOpenDialogMock).toHaveBeenLastCalledWith({
      properties: ['openDirectory'],
      title: 'Zielordner fuer Clone auswaehlen',
    });
  });
});
