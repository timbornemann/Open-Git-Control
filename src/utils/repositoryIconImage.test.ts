// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRepositoryIconThumbnail } from './repositoryIconImage';
const draw = vi.fn(),
  toData = vi.fn(() => 'data:image/png;base64,small');
let width = 400,
  height = 200;
const decode = vi.fn();
beforeEach(() => {
  width = 400;
  height = 200;
  draw.mockReset();
  toData.mockClear();
  decode.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width;
      naturalHeight = height;
      decoding = '';
      src = '';
      decode = decode;
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toData);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('creates a transparent contained 128px PNG and preserves the source aspect ratio', async () => {
  expect(await createRepositoryIconThumbnail('data:image/svg+xml;base64,PHN2Zy8+')).toBe('data:image/png;base64,small');
  expect(decode).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledWith(expect.objectContaining({ decoding: 'async' }), 0, 32, 128, 64);
  expect(toData).toHaveBeenCalledWith('image/png');
});
it('rejects external URLs, corrupt images and excessive dimensions', async () => {
  await expect(createRepositoryIconThumbnail('https://external.invalid/icon.svg')).rejects.toThrow('Invalid repository image');
  decode.mockRejectedValueOnce(new Error('Cannot decode image'));
  await expect(createRepositoryIconThumbnail('data:image/png;base64,broken')).rejects.toThrow('Cannot decode');
  width = 20000;
  height = 20000;
  await expect(createRepositoryIconThumbnail('data:image/png;base64,big')).rejects.toThrow('dimensions are too large');
  expect(draw).not.toHaveBeenCalled();
});
it('reports unavailable canvas support without caching a broken result', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await expect(createRepositoryIconThumbnail('data:image/png;base64,ok')).rejects.toThrow('could not be generated');
});
