import { describe, expect, it, vi } from 'vitest';
import { MAX_HTML_PREVIEW_BYTES } from '@/shared/htmlPreviewSecurity';
import { loadHtmlPreviewAssets, MAX_HTML_PREVIEW_ASSETS } from '../htmlPreviewAssetLoader';
import type { HtmlPreviewAsset } from '../htmlPreview';

const assets = (count: number): HtmlPreviewAsset[] => Array.from({ length: count }, (_, index) => ({ kind: 'image', path: `${index}.png` }));

describe('bounded HTML preview assets', () => {
  it('limits concurrent reads while retaining available and missing assets', async () => {
    let active = 0;
    let maximum = 0;
    const result = await loadHtmlPreviewAssets(
      '',
      assets(20),
      async (asset) => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        active--;
        return asset.path === '0.png' ? null : 'data:image/png;base64,AAAA';
      },
      () => true,
    );
    expect(maximum).toBe(4);
    expect(result.missing).toEqual(['0.png']);
    expect(Object.keys(result.content.images)).toHaveLength(19);
  });

  it('rejects excessive asset counts before starting filesystem requests', async () => {
    const read = vi.fn(async () => '');
    await expect(loadHtmlPreviewAssets('', assets(MAX_HTML_PREVIEW_ASSETS + 1), read, () => true)).rejects.toThrow('asset limit');
    expect(read).not.toHaveBeenCalled();
  });

  it('enforces the aggregate UTF-8 byte limit and stops scheduling additional reads', async () => {
    const read = vi.fn(async () => 'é'.repeat(MAX_HTML_PREVIEW_BYTES / 4));
    await expect(loadHtmlPreviewAssets('non-empty document', assets(20), read, () => true)).rejects.toThrow('size limit');
    expect(read.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('stops stale previews after the already-running reads finish', async () => {
    let current = true;
    const read = vi.fn(async () => {
      current = false;
      return 'old data';
    });
    const result = await loadHtmlPreviewAssets('', assets(20), read, () => current);
    expect(read).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.content.images)).toHaveLength(0);
  });

  it('treats prototype-looking filenames as ordinary asset names', async () => {
    const result = await loadHtmlPreviewAssets(
      '',
      [{ kind: 'script', path: '__proto__' }],
      async () => 'local script',
      () => true,
    );
    expect(result.content.scripts.__proto__).toBe('local script');
    expect(Object.getPrototypeOf(result.content.scripts)).toBeNull();
  });
});
