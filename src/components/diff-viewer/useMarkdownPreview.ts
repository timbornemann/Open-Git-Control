import { useCallback, useEffect, useState } from 'react';
import type { DiffRequest } from '../../types/diff';
import {
  applyMarkdownPreviewImageDataUrls,
  collectMarkdownPreviewImageSources,
  isExternalMarkdownUrl,
  renderMarkdownToSanitizedHtml,
  resolveMarkdownPreviewAssetPath,
} from '../../utils/markdownPreview';
import type { TranslateFn } from './diffViewerLabels';

export type MarkdownPreviewState = {
  loading: boolean;
  error: string | null;
  html: string;
};

type UseMarkdownPreviewParams = {
  repoPath: string | null;
  request: DiffRequest;
  isActive: boolean;
  tr: TranslateFn;
};

const EMPTY_MARKDOWN_PREVIEW: MarkdownPreviewState = {
  loading: false,
  error: null,
  html: '',
};

export const useMarkdownPreview = ({ repoPath, request, isActive, tr }: UseMarkdownPreviewParams) => {
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownPreviewState>(EMPTY_MARKDOWN_PREVIEW);

  useEffect(() => {
    setMarkdownPreview(EMPTY_MARKDOWN_PREVIEW);
  }, [request]);

  useEffect(() => {
    if (!repoPath || !window.electronAPI || !isActive) return;

    let cancelled = false;
    const loadPreview = async () => {
      setMarkdownPreview({ loading: true, error: null, html: '' });

      try {
        const markdownResult = await window.electronAPI.getMarkdownPreviewFile({
          source: request.source,
          path: request.path,
          commitHash: request.commitHash,
        });

        if (!markdownResult.success) {
          if (!cancelled) {
            setMarkdownPreview({
              loading: false,
              error: markdownResult.error || tr('Markdown-Vorschau konnte nicht geladen werden.', 'Could not load Markdown preview.'),
              html: '',
            });
          }
          return;
        }

        const initialHtml = renderMarkdownToSanitizedHtml(markdownResult.data.text);
        const imageSources = collectMarkdownPreviewImageSources(initialHtml);
        const dataUrlsBySource: Record<string, string> = {};

        await Promise.all(imageSources.map(async (imageSource) => {
          const assetPath = resolveMarkdownPreviewAssetPath(request.path, imageSource);
          if (!assetPath || !window.electronAPI) return;

          let assetResult = await window.electronAPI.getRepoFileDataUrl({
            source: request.source,
            path: assetPath,
            commitHash: request.commitHash,
          });

          if (!assetResult.success && request.source === 'staged') {
            assetResult = await window.electronAPI.getRepoFileDataUrl({
              source: 'unstaged',
              path: assetPath,
            });
          }

          if (assetResult.success) {
            dataUrlsBySource[imageSource] = assetResult.data.dataUrl;
          }
        }));

        const html = applyMarkdownPreviewImageDataUrls(initialHtml, dataUrlsBySource);
        if (!cancelled) {
          setMarkdownPreview({ loading: false, error: null, html });
        }
      } catch (previewError: unknown) {
        if (!cancelled) {
          const message = previewError instanceof Error
            ? previewError.message
            : tr('Markdown-Vorschau konnte nicht geladen werden.', 'Could not load Markdown preview.');
          setMarkdownPreview({ loading: false, error: message, html: '' });
        }
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [isActive, repoPath, request, tr]);

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
    if (isExternalMarkdownUrl(href) && /^https:/i.test(href) && window.electronAPI?.openExternalUrl) {
      void window.electronAPI.openExternalUrl(href);
    }
  }, []);

  return {
    markdownPreview,
    handleMarkdownPreviewClick,
  };
};
