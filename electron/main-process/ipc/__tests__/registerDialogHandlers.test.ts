import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDialogHandlers } from '../registerDialogHandlers';

const { handleMock, showOpenDialogMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  showOpenDialogMock: vi.fn(),
}));
const { grantSelectedFilesMock } = vi.hoisted(() => ({
  grantSelectedFilesMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
}));

vi.mock('../../fileAccessGrant', () => ({
  grantSelectedFiles: grantSelectedFilesMock,
}));

describe('registerDialogHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    showOpenDialogMock.mockReset();
    grantSelectedFilesMock.mockReset();
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
    const selectProjectParentDirectoryHandler = handlers.get('dialog:selectProjectParentDirectory');
    expect(openDirectoryHandler).toBeTruthy();
    expect(selectDirectoryHandler).toBeTruthy();
    expect(selectProjectParentDirectoryHandler).toBeTruthy();

    const openResult = await openDirectoryHandler!();
    expect(openResult).toEqual({ path: 'D:/tmp/not-a-repo', isRepo: false });

    const selectResult = await selectDirectoryHandler!();
    expect(selectResult).toBe('D:/tmp/clone-target');
    expect(showOpenDialogMock).toHaveBeenLastCalledWith({
      properties: ['openDirectory'],
      title: 'Zielordner fuer Clone auswaehlen',
    });

    showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['D:/tmp/projects'] });
    const projectParentResult = await selectProjectParentDirectoryHandler!();
    expect(projectParentResult).toBe('D:/tmp/projects');
    expect(showOpenDialogMock).toHaveBeenLastCalledWith({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Speicherort fuer neues Projekt auswaehlen',
      buttonLabel: 'Speicherort auswaehlen',
    });
  });

  it('returns null when any dialog is canceled', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
    const gitService = { runCommandAtPath: vi.fn() } as any;
    registerDialogHandlers({ gitService });

    expect(await handlers.get('dialog:openDirectory')!()).toBeNull();
    expect(await handlers.get('dialog:selectDirectory')!()).toBeNull();
    expect(await handlers.get('dialog:selectProjectParentDirectory')!()).toBeNull();
    expect(await handlers.get('dialog:selectFiles')!()).toBeNull();
    expect(gitService.runCommandAtPath).not.toHaveBeenCalled();
  });

  it('returns the selected files for a multi-select file dialog', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['D:/a.txt', 'D:/b.txt'] });
    const gitService = { runCommandAtPath: vi.fn() } as any;
    registerDialogHandlers({ gitService });

    const selectFilesHandler = handlers.get('dialog:selectFiles');
    expect(selectFilesHandler).toBeTruthy();

    const files = await selectFilesHandler!({ sender: { id: 42 } });
    expect(files).toEqual(['D:/a.txt', 'D:/b.txt']);
    expect(grantSelectedFilesMock).toHaveBeenCalledWith(42, ['D:/a.txt', 'D:/b.txt']);
    expect(showOpenDialogMock).toHaveBeenLastCalledWith({
      properties: ['openFile', 'multiSelections'],
      title: 'Dateien auswaehlen',
    });
  });
});
