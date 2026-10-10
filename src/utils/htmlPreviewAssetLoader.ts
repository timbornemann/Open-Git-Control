import { MAX_HTML_PREVIEW_BYTES } from '@/shared/htmlPreviewSecurity';
import type { HtmlPreviewAsset, HtmlPreviewAssetContent } from './htmlPreview';

export const MAX_HTML_PREVIEW_ASSETS = 256;
const MAX_CONCURRENT_ASSET_READS = 4;

export async function loadHtmlPreviewAssets(
  html: string,
  assets: HtmlPreviewAsset[],
  readAsset: (asset: HtmlPreviewAsset) => Promise<string | null>,
  isCurrent: () => boolean,
): Promise<{ content: HtmlPreviewAssetContent; missing: string[] }> {
  let bytes = new TextEncoder().encode(html).byteLength;
  if (assets.length > MAX_HTML_PREVIEW_ASSETS) throw new Error(`HTML preview exceeds the ${MAX_HTML_PREVIEW_ASSETS} asset limit.`);
  if (bytes > MAX_HTML_PREVIEW_BYTES) throw new Error('HTML preview exceeds the 16 MiB size limit.');
  const content: HtmlPreviewAssetContent = { images: Object.create(null), scripts: Object.create(null), styles: Object.create(null) };
  const missing: string[] = [];
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && isCurrent() && next < assets.length) {
      const asset = assets[next++];
      try {
        const value = await readAsset(asset);
        if (failed || !isCurrent()) return;
        if (value === null) {
          missing.push(asset.path);
          continue;
        }
        bytes += new TextEncoder().encode(value).byteLength;
        if (bytes > MAX_HTML_PREVIEW_BYTES) throw new Error('HTML preview exceeds the 16 MiB size limit.');
        content[`${asset.kind}s`][asset.path] = value;
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_ASSET_READS, assets.length) }, worker));
  return { content, missing };
}
