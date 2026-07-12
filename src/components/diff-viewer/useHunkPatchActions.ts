import { useCallback, useEffect, useRef, useState } from 'react';
import { buildHunkPatch, parseDiff, type ParsedHunk } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import type { CatalogTranslateFn } from '@/i18n';
import type { DiffRequest } from '@/types/diff';

export type HunkPatchOperation = 'stage' | 'unstage' | 'discard';

type UseHunkPatchActionsParams = {
  repoPath: string | null;
  request: Pick<DiffRequest, 'path' | 'source'>;
  onRepoChanged?: () => void;
  onApplied?: () => void;
  onError?: (message: string) => void;
  t: CatalogTranslateFn;
};

const buildCurrentDiffArgs = (request: Pick<DiffRequest, 'path' | 'source'>): string[] =>
  request.source === 'staged' ? ['diff', '--cached', '--', request.path] : ['diff', '--', request.path];

const hasSameRawLines = (left: ParsedHunk, right: ParsedHunk): boolean =>
  left.rawLines.length === right.rawLines.length && left.rawLines.every((line, index) => line === right.rawLines[index]);

const isOutdatedHunkError = (error: string | undefined): boolean => /patch (failed|does not apply)/i.test(error || '');

const buildCurrentHunkPatch = (diffText: string, displayedHunk: ParsedHunk): string | null => {
  const currentDiff = parseDiff(diffText);
  const currentHunk = currentDiff.hunks.find((candidate) => hasSameRawLines(candidate, displayedHunk));
  return currentHunk ? buildHunkPatch(currentDiff.fileHeader, currentHunk) : null;
};

export const useHunkPatchActions = ({ repoPath, request, onRepoChanged, onApplied, onError, t }: UseHunkPatchActionsParams) => {
  const [isHunkOperationRunning, setIsHunkOperationRunning] = useState(false);
  const operationRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const nextOperationIdRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    operationRef.current = null;
    setIsHunkOperationRunning(false);
  }, [repoPath]);

  const applyHunk = useCallback(
    async (hunk: ParsedHunk, fileHeader: string[], op: HunkPatchOperation) => {
      if (!repoPath || !gitClient.isAvailable() || operationRef.current !== null) return;
      const generation = generationRef.current;
      const operationId = ++nextOperationIdRef.current;
      operationRef.current = operationId;
      setIsHunkOperationRunning(true);
      try {
        const applyPatch = async (patch: string) =>
          op === 'stage'
            ? await gitClient.applyPatch(patch, { cached: true }, repoPath)
            : op === 'unstage'
              ? await gitClient.applyPatch(patch, { cached: true, reverse: true }, repoPath)
              : await gitClient.applyPatch(patch, { reverse: true }, repoPath);
        const result = await applyPatch(buildHunkPatch(fileHeader, hunk));

        if (generation !== generationRef.current || operationRef.current !== operationId) return;
        if (result.success) {
          onRepoChanged?.();
          onApplied?.();
        } else {
          // A previous hunk can have been staged while this displayed hunk was
          // still rendered. Its context is unchanged, but its old line offset
          // is now stale, so reload only the current file and retry that exact
          // hunk with Git's current line numbers.
          const latestDiff = isOutdatedHunkError(result.error)
            ? await gitClient.getDiffPreview(buildCurrentDiffArgs(request), undefined, repoPath).catch(() => null)
            : null;
          if (generation !== generationRef.current || operationRef.current !== operationId) return;

          const currentPatch = latestDiff?.success ? buildCurrentHunkPatch(latestDiff.data.text, hunk) : null;
          if (currentPatch) {
            const retryResult = await applyPatch(currentPatch);

            if (generation !== generationRef.current || operationRef.current !== operationId) return;
            if (retryResult.success) {
              onRepoChanged?.();
              onApplied?.();
              return;
            }
          }

          onError?.(result.error || t('diffViewer.errors.hunkOperationFailed'));
        }
      } catch (error: unknown) {
        if (generation !== generationRef.current || operationRef.current !== operationId) return;
        onError?.(error instanceof Error ? error.message : t('diffViewer.errors.hunkOperationFailed'));
      } finally {
        if (operationRef.current === operationId) {
          operationRef.current = null;
          if (generation === generationRef.current) setIsHunkOperationRunning(false);
        }
      }
    },
    [onApplied, onError, onRepoChanged, repoPath, request, t],
  );

  return {
    isHunkOperationRunning,
    applyHunk,
  };
};
