import { useResourceState } from '@/data/resourceHooks';
import { freshRead } from '@/data/clientCache';
import type { DiffPreviewDto } from '@/types/gitDtos';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { parseDiff } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import { MAX_RENDER_CHARS, MAX_RENDER_LINES, looksBinaryByExtension } from './diffViewerConstants';
import type { CatalogTranslateFn } from '@/i18n';

type UseDiffPreviewDataParams = {
  repoPath: string | null;
  request: DiffRequest;
  refreshTrigger?: number;
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

export const useDiffPreviewData = ({ repoPath, request, refreshTrigger, t }: UseDiffPreviewDataParams) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ repoPath: string; request: DiffRequest; refreshTrigger: number | undefined; preview: DiffPreviewDto } | null>(
    null,
  );
  const [preview, setPreview, hasPreview] = useResourceState<DiffPreviewDto | null>(
    'git',
    'getDiffPreview',
    [buildDiffPreviewArgs(request), { maxBytes: MAX_RENDER_CHARS, maxLines: MAX_RENDER_LINES }, repoPath],
    null,
  );
  const diffText = preview?.text || '';
  const sourceTruncated = preview?.truncated || false;
  const requestGenerationRef = useRef(0);

  useLayoutEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!repoPath || !gitClient.isAvailable()) {
      setIsLoading(false);
      setError(null);
      return;
    }

    const fetchDiff = async () => {
      setIsLoading(!hasPreview);
      setError(null);

      try {
        const result = await freshRead(() =>
          gitClient.getDiffPreview(
            buildDiffPreviewArgs(request),
            {
              maxBytes: MAX_RENDER_CHARS,
              maxLines: MAX_RENDER_LINES,
            },
            repoPath,
          ),
        );
        if (!isCurrentRequest()) return;

        if (!result.success) {
          setError(result.error || t('diffViewer.errors.diffLoadFailed'));
          return;
        }

        setPreview(result.data);
        setConfirmed({ repoPath, request, refreshTrigger, preview: result.data });
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
  }, [refreshTrigger, repoPath, request, t, hasPreview, setPreview]);

  const looksBinaryByExt = useMemo(() => looksBinaryByExtension(request.path), [request.path]);

  const isBinaryDiff = useMemo(() => {
    if (!diffText) return false;
    // Git emits these markers as complete, unprefixed lines. Matching source
    // lines too would hide text files that merely mention binary diffs.
    return /^(?:Binary files .+ differ|GIT binary patch)\r?$/m.test(diffText);
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
    isLoading: isLoading && !hasPreview,
    error,
    diffText,
    sourceTruncated,
    parsed,
    canRenderText,
    isBinaryDiff,
    looksBinaryByExt,
    isTooLarge,
    hunkCount: parsed.hunks.length,
    confirmedPreview:
      confirmed?.repoPath === repoPath && confirmed.request === request && confirmed.refreshTrigger === refreshTrigger ? confirmed.preview : null,
  };
};
