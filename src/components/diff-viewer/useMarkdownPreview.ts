import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { gitClient } from '@/services/gitClient';
import { handleMarkdownPreviewClick } from '@/components/ui/markdownPreviewNavigation';
import {
  applyMarkdownPreviewImageDataUrls,
  collectMarkdownPreviewImageSources,
  renderMarkdownToSanitizedHtml,
  resolveMarkdownPreviewAssetPath,
} from '@/utils/markdownPreview';
import type { CatalogTranslateFn } from '@/i18n';
import { loadHtmlPreviewAssets } from '@/utils/htmlPreviewAssetLoader';

export type MarkdownPreviewState = {
  loading: boolean;
  error: string | null;
  html: string;
};

type UseMarkdownPreviewParams = {
  repoPath: string | null;
  request: DiffRequest;
  isActive: boolean;
  t: CatalogTranslateFn;
  /** Current editor text, when a preview must include unsaved working-tree edits. */
  markdownText?: string;
};

const EMPTY_MARKDOWN_PREVIEW: MarkdownPreviewState = {
  loading: false,
  error: null,
  html: '',
};

export const useMarkdownPreview = ({ repoPath, request, isActive, t, markdownText }: UseMarkdownPreviewParams) => {
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownPreviewState>(EMPTY_MARKDOWN_PREVIEW);
  const requestGenerationRef = useRef(0);

  useLayoutEffect(() => {
    setMarkdownPreview(EMPTY_MARKDOWN_PREVIEW);
  }, [markdownText, repoPath, request]);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!repoPath || !gitClient.isAvailable() || !isActive) {
      setMarkdownPreview(EMPTY_MARKDOWN_PREVIEW);
      return;
    }
    const repoAtStart = repoPath;

    const loadPreview = async () => {
      setMarkdownPreview({ loading: true, error: null, html: '' });

      try {
        let sourceText = markdownText;
        if (sourceText === undefined) {
          const markdownResult = await gitClient.getMarkdownPreviewFile({
            source: request.source,
            path: request.path,
            commitHash: request.commitHash,
            repoPath: repoAtStart,
          });

          if (!markdownResult.success) {
            if (isCurrentRequest()) {
              setMarkdownPreview({
                loading: false,
                error: markdownResult.error || t('diffViewer.errors.markdownPreviewLoadFailed'),
                html: '',
              });
            }
            return;
          }
          sourceText = markdownResult.data.text;
        }

        const initialHtml = renderMarkdownToSanitizedHtml(sourceText);
        const imageSources = collectMarkdownPreviewImageSources(initialHtml);
        const assets = imageSources
          .filter((source) => resolveMarkdownPreviewAssetPath(request.path, source))
          .map((source) => ({ kind: 'image' as const, path: source }));
        const { content, missing } = await loadHtmlPreviewAssets(
          initialHtml,
          assets,
          async (asset) => {
            const assetPath = resolveMarkdownPreviewAssetPath(request.path, asset.path)!;
            if (!gitClient.isAvailable()) return null;
            const assetResult = await gitClient.getRepoFileDataUrl({
              source: request.source,
              path: assetPath,
              commitHash: request.commitHash,
              repoPath: repoAtStart,
            });

            return assetResult.success ? assetResult.data.dataUrl : null;
          },
          isCurrentRequest,
          'Markdown preview',
        );

        const html = applyMarkdownPreviewImageDataUrls(initialHtml, content.images, true);
        if (isCurrentRequest()) {
          const missingPaths = missing.map((source) => resolveMarkdownPreviewAssetPath(request.path, source));
          setMarkdownPreview({ loading: false, error: missing.length ? `Assets unavailable in this version: ${missingPaths.join(', ')}` : null, html });
        }
      } catch (previewError: unknown) {
        if (isCurrentRequest()) {
          const message = previewError instanceof Error ? previewError.message : t('diffViewer.errors.markdownPreviewLoadFailed');
          setMarkdownPreview({ loading: false, error: message, html: '' });
        }
      }
    };

    void loadPreview();
    return () => {
      if (requestGenerationRef.current === requestGeneration) requestGenerationRef.current += 1;
    };
  }, [isActive, markdownText, repoPath, request, t]);

  return {
    markdownPreview,
    handleMarkdownPreviewClick,
  };
};
