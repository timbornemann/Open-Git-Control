// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { createRepositoryIconThumbnail } from '@/utils/repositoryIconImage';
import { loadRepositoryIconPreview } from '../repositoryIconPreview';
import { repositoryIconsClient } from '../repositoryIconsClient';

vi.mock('@/utils/repositoryIconImage', () => ({ createRepositoryIconThumbnail: vi.fn() }));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const source = { success: true, data: { path: 'logo.svg', version: 'original-version', dataUrl: 'data:image/svg+xml;base64,original' } };
const read = vi.fn();
beforeEach(() => {
  read.mockReset().mockResolvedValue(source);
  vi.mocked(createRepositoryIconThumbnail).mockReset().mockResolvedValue('small PNG');
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { repos: { getRepositoryIcon: vi.fn(), readRepositoryIconSource: read } } as unknown as ElectronAPI,
  });
});
afterEach(() => {
  delete (window as { electronAPI?: ElectronAPI }).electronAPI;
  vi.restoreAllMocks();
});
describe('repository image preview queue', () => {
  it('deduplicates concurrent thumbnails and frees raw image data after completion', async () => {
    const pending = deferred<string>();
    vi.mocked(createRepositoryIconThumbnail).mockReturnValueOnce(pending.promise);
    const first = loadRepositoryIconPreview('C:/Repo', 'logo.svg'),
      second = loadRepositoryIconPreview('C:/Repo', 'logo.svg');
    expect(second).toBe(first);
    await Promise.resolve();
    await Promise.resolve();
    expect(read).toHaveBeenCalledOnce();
    pending.resolve('small PNG');
    expect(await first).toEqual({ version: 'original-version', dataUrl: 'small PNG' });
    await loadRepositoryIconPreview('C:/Repo', 'logo.svg');
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('bounds simultaneous reads and decoding at two without mixing repositories of the same name', async () => {
    const one = deferred<string>(),
      two = deferred<string>();
    vi.mocked(createRepositoryIconThumbnail).mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
    const first = loadRepositoryIconPreview('C:/Repo', 'logo.svg'),
      second = loadRepositoryIconPreview('D:/Repo', 'logo.svg'),
      third = loadRepositoryIconPreview('E:/Repo', 'logo.svg');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    one.resolve('PNG one');
    await first;
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(3);
    two.resolve('PNG two');
    expect((await Promise.all([first, second, third])).map((preview) => preview.dataUrl)).toEqual(['PNG one', 'PNG two', 'small PNG']);
  });
  it('releases failed reads and corrupt decodes so later candidates can succeed', async () => {
    read.mockResolvedValueOnce({ success: false, error: 'File removed' });
    await expect(loadRepositoryIconPreview('C:/Repo', 'bad.svg')).rejects.toThrow('File removed');
    vi.mocked(createRepositoryIconThumbnail).mockRejectedValueOnce(new Error('Cannot decode'));
    await expect(loadRepositoryIconPreview('C:/Repo', 'bad.svg')).rejects.toThrow('Cannot decode');
    expect(await loadRepositoryIconPreview('C:/Repo', 'bad.svg')).toEqual({ dataUrl: 'small PNG', version: 'original-version' });
  });
  it('reports a missing preload API and rejects calls instead of pretending to find no logos', () => {
    expect(repositoryIconsClient.isAvailable()).toBe(true);
    delete (window as { electronAPI?: ElectronAPI }).electronAPI;
    expect(repositoryIconsClient.isAvailable()).toBe(false);
    expect(() => repositoryIconsClient.get('C:/Repo')).toThrow('API is unavailable');
  });
});
