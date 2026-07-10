import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { parseDiff } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import { MAX_RENDER_CHARS, MAX_RENDER_LINES, looksBinaryByExtension } from './diffViewerConstants';
import type { CatalogTranslateFn } from '@/i18n';

type UseDiffPreviewDataParams = {
  repoPath: string | null;
  request: DiffRequest;
  t: CatalogTranslateFn;
};

const buildDiffPreviewArgs = (request: DiffRequest): string[] => {
  if (request.source === 'staged') {
    return ['diff', '--cached', '--', request.path];
  }
  if (request.source === 'unstaged') {
    return ['diff', '--', request.path];
  }
  return ['show', '--format=', '--binary', request.commitHash || '', '--', request.path];
};

export const useDiffPreviewData = ({ repoPath, request, t }: UseDiffPreviewDataParams) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [sourceTruncated, setSourceTruncated] = useState(false);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!repoPath || !gitClient.isAvailable()) {
      setIsLoading(false);
      setError(null);
      setDiffText('');
      setSourceTruncated(false);
      return;
    }

    const fetchDiff = async () => {
      setIsLoading(true);
      setError(null);
      setDiffText('');
      setSourceTruncated(false);

      try {
        const result = await gitClient.getDiffPreview(buildDiffPreviewArgs(request), {
          maxBytes: MAX_RENDER_CHARS,
          maxLines: MAX_RENDER_LINES,
        });
        if (!isCurrentRequest()) return;

        if (!result.success) {
          setError(result.error || t('diffViewer.errors.diffLoadFailed'));
          return;
        }

        setDiffText(result.data.text);
        setSourceTruncated(result.data.truncated);
      } catch (fetchError: unknown) {
        if (!isCurrentRequest()) return;
        console.error(fetchError);
        setError(t('diffViewer.errors.diffLoadFailed'));
      } finally {
        if (isCurrentRequest()) {
          setIsLoading(false);
        }
      }
    };

    void fetchDiff();
    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [repoPath, request, t]);

  const looksBinaryByExt = useMemo(() => looksBinaryByExtension(request.path), [request.path]);

  const isBinaryDiff = useMemo(() => {
    if (!diffText) return false;
    return diffText.includes('Binary files') || diffText.includes('GIT binary patch');
  }, [diffText]);

  const isTooLarge = useMemo(() => {
    if (!diffText) return false;
    const lineCount = diffText.split('\n').length;
    return sourceTruncated || diffText.length > MAX_RENDER_CHARS || lineCount > MAX_RENDER_LINES;
  }, [diffText, sourceTruncated]);

  const clippedDiffText = useMemo(() => {
    if (!diffText) return '';
    return diffText.slice(0, MAX_RENDER_CHARS).split('\n').slice(0, MAX_RENDER_LINES).join('\n');
  }, [diffText]);

  const parsed = useMemo(() => parseDiff(clippedDiffText), [clippedDiffText]);
  const canRenderText = !isBinaryDiff && !looksBinaryByExt;

  return {
    isLoading,
    error,
    diffText,
    sourceTruncated,
    parsed,
    canRenderText,
    isBinaryDiff,
    looksBinaryByExt,
    isTooLarge,
    hunkCount: parsed.hunks.length,
  };
};
