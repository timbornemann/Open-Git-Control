import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryIconService } from '../../RepositoryIconService';
import { registerRepositoryIconHandlers, validateRepositoryIconPng } from '../registerRepositoryIconHandlers';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { REPOSITORY_ICON_MAX_PNG_BYTES } from '../../../../src/shared/repositoryIcons';
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  store: vi.fn(),
  onChange: vi.fn(),
  picker: vi.fn(),
  native: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => 'unused' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => mocks.handlers.set(channel, handler) },
  dialog: { showOpenDialog: mocks.picker },
  nativeImage: { createFromBuffer: mocks.native },
}));
vi.mock('../../repoStore', () => ({ readStoreData: mocks.store, onRepoStoreChanged: mocks.onChange }));
let root: string, repo: string, saved: string[], service: RepositoryIconService;
const event = () => ({ sender: { id: 13, once: vi.fn(), isDestroyed: vi.fn(() => false), send: vi.fn() } });
const invoke = (channel: IpcChannel, repoPath: string, input?: unknown, sender = event()) => mocks.handlers.get(channel)!(sender, repoPath, input);
const thumbnail = (width = 128, height = 128) => {
  const data = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return `data:image/png;base64,${data.toString('base64')}`;
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-icon-ipc-'));
  repo = path.join(root, 'inactive');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'logo.svg'), '<svg/>');
  saved = [repo];
  mocks.handlers.clear();
  mocks.store.mockReset().mockImplementation(() => ({ repos: saved.map((entry) => ({ path: entry })) }));
  mocks.onChange.mockReset();
  mocks.picker.mockReset();
  mocks.native.mockReset().mockReturnValue({ isEmpty: () => false, toPNG: () => Buffer.from('canonical PNG') });
  service = new RepositoryIconService({ directory: path.join(root, 'cache'), storedPaths: () => saved, validatePng: validateRepositoryIconPng });
  registerRepositoryIconHandlers(service);
});
afterEach(() => {
  service.retainRepositories([]);
  saved = [];
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-icon-ipc-'))
    throw new Error('Invalid cleanup path');
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
describe('repository logo IPC', () => {
  it('accepts an exact saved inactive repository and never exposes nested or arbitrary directories', async () => {
    expect(await invoke(IpcChannel.RepositoryIconGet, repo, true)).toMatchObject({ success: true, data: { repoPath: repo, candidates: ['logo.svg'] } });
    expect(await invoke(IpcChannel.RepositoryIconSource, repo, 'logo.svg')).toMatchObject({ success: true, data: { path: 'logo.svg' } });
    for (const candidate of ['', '.', root, path.join(repo, 'nested')]) {
      expect(await invoke(IpcChannel.RepositoryIconGet, candidate)).toMatchObject({ success: false });
    }
    expect(await invoke(IpcChannel.RepositoryIconSource, repo, '../outside.svg')).toMatchObject({ success: false });
  });
  it('broadcasts to registered windows, ignores destroyed windows and releases sender registration', async () => {
    const first = event(),
      second = event();
    second.sender.id = 14;
    await invoke(IpcChannel.RepositoryIconGet, repo, true, first);
    await invoke(IpcChannel.RepositoryIconGet, repo, true, second);
    first.sender.send.mockClear();
    second.sender.send.mockClear();
    second.sender.isDestroyed.mockReturnValue(true);
    const state = await service.get(repo);
    const choice = { mode: 'initials', expectedSelectionVersion: state.selectionVersion };
    expect(await invoke(IpcChannel.RepositoryIconChoice, repo, choice, first)).toMatchObject({ success: true, data: { mode: 'initials' } });
    expect(first.sender.send).toHaveBeenCalledWith(IpcChannel.RepositoryIconChanged, expect.objectContaining({ repoPath: repo, mode: 'initials' }));
    expect(second.sender.send).not.toHaveBeenCalled();
    first.sender.once.mock.calls[0][1]();
    first.sender.send.mockClear();
    await service.get(repo, true);
    expect(first.sender.send).not.toHaveBeenCalled();
  });
  it('only selects image files inside the same saved repository and rejects removal while the picker is open', async () => {
    mocks.picker.mockResolvedValueOnce({ canceled: true, filePaths: [] }).mockResolvedValueOnce({ canceled: false, filePaths: [path.join(repo, 'logo.svg')] });
    expect(await invoke(IpcChannel.RepositoryIconSelectFile, repo)).toEqual({ success: true, data: null });
    expect(await invoke(IpcChannel.RepositoryIconSelectFile, repo)).toEqual({ success: true, data: 'logo.svg' });
    expect(mocks.picker).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: repo, properties: ['openFile'] }));
    fs.writeFileSync(path.join(root, 'outside.svg'), '<svg/>');
    mocks.picker.mockResolvedValueOnce({ canceled: false, filePaths: [path.join(root, 'outside.svg')] });
    expect(await invoke(IpcChannel.RepositoryIconSelectFile, repo)).toMatchObject({ success: false });
    mocks.picker.mockImplementationOnce(async () => {
      saved = [];
      return { canceled: false, filePaths: [path.join(repo, 'logo.svg')] };
    });
    expect(await invoke(IpcChannel.RepositoryIconSelectFile, repo)).toMatchObject({ success: false, error: expect.stringContaining('saved repositories') });
  });
  it('validates thumbnail writes and cleans preferences when the saved repository list changes', async () => {
    const state = await service.get(repo, true),
      source = await service.readSource(repo, 'logo.svg');
    const response = await invoke(IpcChannel.RepositoryIconCache, repo, {
      path: source.path,
      sourceVersion: source.version,
      expectedRevision: state.revision,
      selectionVersion: state.selectionVersion,
      dataUrl: thumbnail(),
    });
    expect(response).toMatchObject({
      success: true,
      data: { thumbnail: { dataUrl: `data:image/png;base64,${Buffer.from('canonical PNG').toString('base64')}` } },
    });
    saved = [];
    mocks.onChange.mock.calls[0][0]();
    expect(await invoke(IpcChannel.RepositoryIconGet, repo)).toMatchObject({ success: false });
  });
});
describe('repository thumbnail validation', () => {
  it('re-encodes a bounded 128px PNG through nativeImage', () => {
    expect(validateRepositoryIconPng(thumbnail())).toBe(`data:image/png;base64,${Buffer.from('canonical PNG').toString('base64')}`);
    expect(mocks.native).toHaveBeenCalledOnce();
  });
  it('rejects SVG, external URLs, non-PNG bytes, huge previews and unexpected dimensions before decoding', () => {
    for (const data of [
      'data:image/svg+xml;base64,PHN2Zy8+',
      'file:///repo/logo.png',
      'data:image/png;base64,bm90IHBORw==',
      thumbnail(129),
      `data:image/png;base64,${Buffer.alloc(REPOSITORY_ICON_MAX_PNG_BYTES + 1).toString('base64')}`,
    ]) {
      expect(() => validateRepositoryIconPng(data)).toThrow();
    }
    expect(mocks.native).not.toHaveBeenCalled();
  });
  it('rejects a corrupt PNG when the native decoder cannot read it', () => {
    mocks.native.mockReturnValueOnce({ isEmpty: () => true });
    expect(() => validateRepositoryIconPng(thumbnail())).toThrow('Invalid PNG');
  });
});
