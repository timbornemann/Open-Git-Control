import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRepositoryFileViewerHandlers } from '../repositoryFileViewer';
import { IpcChannel } from '../../../../../src/types/ipcContract';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), preview: vi.fn(), info: vi.fn(), save: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock('../../../../git/RepositoryFileViewerService', () => ({
  RepositoryFileViewerService: class {
    getPreview = mocks.preview;
    getInfo = mocks.info;
    save = mocks.save;
  },
}));

const handlers = new Map<string, (event: unknown, request: unknown) => Promise<any>>();
let activeRepo = 'C:/repository-a';
const ensureWriteAllowed = vi.fn();
const context = { repoPath: 'C:/repository-a', path: 'file.txt', source: 'staged' as const };
beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  activeRepo = context.repoPath;
  mocks.handle.mockImplementation((channel, callback) => handlers.set(channel, callback));
  mocks.preview.mockResolvedValue({ kind: 'text', text: 'index', version: 'v1', editable: true });
  mocks.info.mockResolvedValue({ version: 'v1', hashes: { sha256: 'selected' } });
  mocks.save.mockImplementation(async (_request, check) => {
    check();
    return { version: 'v2' };
  });
  registerRepositoryFileViewerHandlers({ getRepoPath: () => activeRepo } as any, ensureWriteAllowed);
});
describe('file viewer IPC authorization', () => {
  it('preserves the full source context in previews, info and saves', async () => {
    expect((await handlers.get(IpcChannel.GitGetRepositoryFilePreview)!({}, context)).data.text).toBe('index');
    expect((await handlers.get(IpcChannel.GitGetRepositoryFileInfo)!({}, context)).data.hashes.sha256).toBe('selected');
    const save = { ...context, content: 'draft', encoding: 'utf8', expectedVersion: 'v1' };
    expect((await handlers.get(IpcChannel.GitSaveRepositoryFile)!({}, save)).data.version).toBe('v2');
    expect(mocks.preview).toHaveBeenCalledWith(context);
    expect(mocks.info).toHaveBeenCalledWith(context);
    expect(mocks.save).toHaveBeenCalledWith(save, expect.any(Function));
    expect(ensureWriteAllowed).toHaveBeenCalledWith(activeRepo);
  });
  it('rejects malformed, inactive and changed repository contexts', async () => {
    expect((await handlers.get(IpcChannel.GitGetRepositoryFilePreview)!({}, null)).success).toBe(false);
    activeRepo = 'C:/repository-b';
    expect((await handlers.get(IpcChannel.GitGetRepositoryFileInfo)!({}, context)).success).toBe(false);
    expect(mocks.info).not.toHaveBeenCalled();
    activeRepo = context.repoPath;
    mocks.save.mockImplementation(async (_request, check) => {
      check();
      activeRepo = 'C:/repository-b';
      check();
      return { version: 'invalid' };
    });
    const result = await handlers.get(IpcChannel.GitSaveRepositoryFile)!({}, { ...context, content: 'draft', encoding: 'utf8', expectedVersion: 'v1' });
    expect(result.success).toBe(false);
    expect(ensureWriteAllowed).toHaveBeenCalledOnce();
  });
  it('returns write-guard and source errors as failed results', async () => {
    ensureWriteAllowed.mockImplementationOnce(() => {
      throw new Error('Write blocked by active operation');
    });
    const result = await handlers.get(IpcChannel.GitSaveRepositoryFile)!({}, { ...context, content: 'draft', encoding: 'utf8', expectedVersion: 'v1' });
    expect(result).toEqual({ success: false, error: 'Write blocked by active operation' });
    mocks.preview.mockRejectedValueOnce(new Error('Invalid source'));
    expect(await handlers.get(IpcChannel.GitGetRepositoryFilePreview)!({}, context)).toEqual({ success: false, error: 'Invalid source' });
  });
});
