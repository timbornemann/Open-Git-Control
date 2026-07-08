import { useEffect, useMemo, useState } from 'react';
import type { DiffRequest } from '../../types/diff';
import { parseDiff } from '../../utils/diffParser';
import { gitClient } from '../../services/gitClient';
import {
  MAX_RENDER_CHARS,
  MAX_RENDER_LINES,
  looksBinaryByExtension,
} from './diffViewerConstants';
import type { CatalogTranslateFn } from '../../i18n';

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

  useEffect(() => {
    const fetchDiff = async () => {
      if (!repoPath || !gitClient.isAvailable()) return;

      setIsLoading(true);
      setError(null);
      setDiffText('');
      setSourceTruncated(false);

      try {
        const result = await gitClient.getDiffPreview(buildDiffPreviewArgs(request), {
          maxBytes: MAX_RENDER_CHARS,
          maxLines: MAX_RENDER_LINES,
        });

        if (!result.success) {
          setError(result.error || t('diffViewer.errors.diffLoadFailed'));
          return;
        }

        setDiffText(result.data.text);
        setSourceTruncated(result.data.truncated);
      } catch (fetchError: unknown) {
        console.error(fetchError);
        setError(t('diffViewer.errors.diffLoadFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchDiff();
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
    return diffText
      .slice(0, MAX_RENDER_CHARS)
      .split('\n')
      .slice(0, MAX_RENDER_LINES)
      .join('\n');
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
