import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import { buildSandboxedHtmlPreviewDocument, collectHtmlPreviewAssets, type HtmlPreviewAssetContent, type HtmlPreviewAssetKind } from '@/utils/htmlPreview';

export type HtmlPreviewState = { loading: boolean; error: string | null; document: string };

const EMPTY_HTML_PREVIEW: HtmlPreviewState = { loading: false, error: null, document: '' };

export const useHtmlPreview = ({ repoPath, path, html, isActive }: { repoPath: string; path: string; html: string; isActive: boolean }) => {
  const [htmlPreview, setHtmlPreview] = useState<HtmlPreviewState>(EMPTY_HTML_PREVIEW);
  const requestGenerationRef = useRef(0);

  useLayoutEffect(() => {
    setHtmlPreview(EMPTY_HTML_PREVIEW);
  }, [path, repoPath]);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!isActive || !gitClient.isAvailable()) {
      setHtmlPreview(EMPTY_HTML_PREVIEW);
      return;
    }

    const loadPreview = async () => {
      setHtmlPreview({ loading: true, error: null, document: '' });
      const assetContent: HtmlPreviewAssetContent = { images: {}, scripts: {}, styles: {} };

      try {
        const assets = collectHtmlPreviewAssets(html, path);
        await Promise.all(
          assets.map(async (asset) => {
            if (asset.kind === 'image') {
              const result = await gitClient.getRepoFileDataUrl({ source: 'unstaged', path: asset.path, repoPath });
              if (result.success) assetContent.images[asset.path] = result.data.dataUrl;
              return;
            }

            const result = await gitClient.getMarkdownPreviewFile({ source: 'unstaged', path: asset.path, repoPath });
            if (result.success) assetContent[`${asset.kind}s` as `${HtmlPreviewAssetKind}s`][asset.path] = result.data.text;
          }),
        );

        if (isCurrentRequest()) {
          setHtmlPreview({ loading: false, error: null, document: buildSandboxedHtmlPreviewDocument(html, path, assetContent) });
        }
      } catch (previewError: unknown) {
        if (isCurrentRequest()) {
          setHtmlPreview({ loading: false, error: previewError instanceof Error ? previewError.message : 'Could not prepare HTML preview.', document: '' });
        }
      }
    };

    void loadPreview();
    return () => {
      if (requestGenerationRef.current === requestGeneration) requestGenerationRef.current += 1;
    };
  }, [html, isActive, path, repoPath]);

  return htmlPreview;
};
