import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import { buildSandboxedHtmlPreviewDocument, collectHtmlPreviewAssets, type HtmlPreviewAssetContent, type HtmlPreviewAssetKind } from '@/utils/htmlPreview';

export type HtmlPreviewState = { loading: boolean; error: string | null; document: string };

const EMPTY_HTML_PREVIEW: HtmlPreviewState = { loading: false, error: null, document: '' };

export const useHtmlPreview = ({
  repoPath,
  path,
  html,
  isActive,
  source = 'unstaged',
  commitHash,
}: { html: string; isActive: boolean } & RepositoryFileContextDto) => {
  const [htmlPreview, setHtmlPreview] = useState<HtmlPreviewState>(EMPTY_HTML_PREVIEW);
  const requestGenerationRef = useRef(0);

  useLayoutEffect(() => {
    setHtmlPreview(EMPTY_HTML_PREVIEW);
  }, [path, repoPath, source, commitHash]);

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
        const missing: string[] = [];
        await Promise.all(
          assets.map(async (asset) => {
            if (asset.kind === 'image') {
              const result = await gitClient.getRepoFileDataUrl({ source, commitHash, path: asset.path, repoPath });
              if (result.success) assetContent.images[asset.path] = result.data.dataUrl;
              else missing.push(asset.path);
              return;
            }

            const result = await gitClient.getMarkdownPreviewFile({ source, commitHash, path: asset.path, repoPath });
            if (result.success) assetContent[`${asset.kind}s` as `${HtmlPreviewAssetKind}s`][asset.path] = result.data.text;
            else missing.push(asset.path);
          }),
        );

        if (isCurrentRequest()) {
          setHtmlPreview({
            loading: false,
            error: missing.length ? `Assets unavailable in this version: ${missing.join(', ')}` : null,
            document: buildSandboxedHtmlPreviewDocument(html, path, assetContent),
          });
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
  }, [html, isActive, path, repoPath, source, commitHash]);

  return htmlPreview;
};
