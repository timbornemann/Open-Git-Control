import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import {
  applyMarkdownPreviewImageDataUrls,
  collectMarkdownPreviewImageSources,
  isExternalMarkdownUrl,
  renderMarkdownToSanitizedHtml,
  resolveMarkdownPreviewAssetPath,
} from '@/utils/markdownPreview';
import type { CatalogTranslateFn } from '@/i18n';

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
};

const EMPTY_MARKDOWN_PREVIEW: MarkdownPreviewState = {
  loading: false,
  error: null,
  html: '',
};

export const useMarkdownPreview = ({ repoPath, request, isActive, t }: UseMarkdownPreviewParams) => {
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownPreviewState>(EMPTY_MARKDOWN_PREVIEW);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    setMarkdownPreview(EMPTY_MARKDOWN_PREVIEW);
  }, [repoPath, request]);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!repoPath || !gitClient.isAvailable() || !isActive) {
      setMarkdownPreview(EMPTY_MARKDOWN_PREVIEW);
      return;
    }

    const loadPreview = async () => {
      setMarkdownPreview({ loading: true, error: null, html: '' });

      try {
        const markdownResult = await gitClient.getMarkdownPreviewFile({
          source: request.source,
          path: request.path,
          commitHash: request.commitHash,
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

        const initialHtml = renderMarkdownToSanitizedHtml(markdownResult.data.text);
        const imageSources = collectMarkdownPreviewImageSources(initialHtml);
        const dataUrlsBySource: Record<string, string> = {};

        await Promise.all(
          imageSources.map(async (imageSource) => {
            const assetPath = resolveMarkdownPreviewAssetPath(request.path, imageSource);
            if (!assetPath || !gitClient.isAvailable()) return;

            let assetResult = await gitClient.getRepoFileDataUrl({
              source: request.source,
              path: assetPath,
              commitHash: request.commitHash,
            });

            if (!assetResult.success && request.source === 'staged') {
              assetResult = await gitClient.getRepoFileDataUrl({
                source: 'unstaged',
                path: assetPath,
              });
            }

            if (assetResult.success) {
              dataUrlsBySource[imageSource] = assetResult.data.dataUrl;
            }
          }),
        );

        const html = applyMarkdownPreviewImageDataUrls(initialHtml, dataUrlsBySource);
        if (isCurrentRequest()) {
          setMarkdownPreview({ loading: false, error: null, html });
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
  }, [isActive, repoPath, request, t]);

  const handleMarkdownPreviewClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) {
      event.preventDefault();
      const targetId = href.slice(1);
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    event.preventDefault();
    if (isExternalMarkdownUrl(href) && /^https:/i.test(href) && appClient.isAvailable()) {
      void appClient.openExternalUrl(href);
    }
  }, []);

  return {
    markdownPreview,
    handleMarkdownPreviewClick,
  };
};
