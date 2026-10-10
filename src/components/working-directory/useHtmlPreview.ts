import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import { buildHtmlPreviewUrl } from '@/shared/htmlPreviewSecurity';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import { buildSandboxedHtmlPreviewDocument, collectHtmlPreviewAssets } from '@/utils/htmlPreview';
import { loadHtmlPreviewAssets } from '@/utils/htmlPreviewAssetLoader';

export type HtmlPreviewState = { loading: boolean; error: string | null; url: string };

const EMPTY_HTML_PREVIEW: HtmlPreviewState = { loading: false, error: null, url: '' };

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
      setHtmlPreview({ loading: true, error: null, url: '' });
      try {
        const assets = collectHtmlPreviewAssets(html, path);
        const { content: assetContent, missing } = await loadHtmlPreviewAssets(
          html,
          assets,
          async (asset) => {
            if (asset.kind === 'image') {
              const result = await gitClient.getRepoFileDataUrl({ source, commitHash, path: asset.path, repoPath });
              return result.success ? result.data.dataUrl : null;
            }

            const result = await gitClient.getMarkdownPreviewFile({ source, commitHash, path: asset.path, repoPath });
            return result.success ? result.data.text : null;
          },
          isCurrentRequest,
        );

        if (isCurrentRequest()) {
          setHtmlPreview({
            loading: false,
            error: missing.length ? `Assets unavailable in this version: ${missing.join(', ')}` : null,
            url: buildHtmlPreviewUrl(buildSandboxedHtmlPreviewDocument(html, path, assetContent)),
          });
        }
      } catch (previewError: unknown) {
        if (isCurrentRequest()) {
          setHtmlPreview({ loading: false, error: previewError instanceof Error ? previewError.message : 'Could not prepare HTML preview.', url: '' });
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
