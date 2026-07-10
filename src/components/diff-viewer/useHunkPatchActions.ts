import { useCallback, useEffect, useRef, useState } from 'react';
import { buildHunkPatch, type ParsedHunk } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import type { CatalogTranslateFn } from '@/i18n';

export type HunkPatchOperation = 'stage' | 'unstage' | 'discard';

type UseHunkPatchActionsParams = {
  repoPath: string | null;
  onRepoChanged?: () => void;
  t: CatalogTranslateFn;
};

export const useHunkPatchActions = ({ repoPath, onRepoChanged, t }: UseHunkPatchActionsParams) => {
  const [hunkOpError, setHunkOpError] = useState<string | null>(null);
  const [isHunkOperationRunning, setIsHunkOperationRunning] = useState(false);
  const operationRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const nextOperationIdRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    operationRef.current = null;
    setIsHunkOperationRunning(false);
    setHunkOpError(null);
  }, [repoPath]);

  const applyHunk = useCallback(
    async (hunk: ParsedHunk, fileHeader: string[], op: HunkPatchOperation) => {
      if (!repoPath || !gitClient.isAvailable() || operationRef.current !== null) return;
      const generation = generationRef.current;
      const operationId = ++nextOperationIdRef.current;
      operationRef.current = operationId;
      setHunkOpError(null);
      setIsHunkOperationRunning(true);
      try {
        const patch = buildHunkPatch(fileHeader, hunk);
        const result =
          op === 'stage'
            ? await gitClient.applyPatch(patch, { cached: true })
            : op === 'unstage'
              ? await gitClient.applyPatch(patch, { cached: true, reverse: true })
              : await gitClient.applyPatch(patch, { reverse: true });

        if (generation !== generationRef.current || operationRef.current !== operationId) return;
        if (result.success) {
          onRepoChanged?.();
        } else {
          setHunkOpError(result.error || t('diffViewer.errors.hunkOperationFailed'));
        }
      } catch (error: unknown) {
        if (generation !== generationRef.current || operationRef.current !== operationId) return;
        setHunkOpError(error instanceof Error ? error.message : t('diffViewer.errors.hunkOperationFailed'));
      } finally {
        if (operationRef.current === operationId) {
          operationRef.current = null;
          if (generation === generationRef.current) setIsHunkOperationRunning(false);
        }
      }
    },
    [onRepoChanged, repoPath, t],
  );

  return {
    hunkOpError,
    isHunkOperationRunning,
    applyHunk,
  };
};
