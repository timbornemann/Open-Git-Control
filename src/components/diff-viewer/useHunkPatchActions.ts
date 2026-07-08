import { useCallback, useState } from 'react';
import { buildHunkPatch, type ParsedHunk } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import type { CatalogTranslateFn } from '@/i18n';

export type HunkPatchOperation = 'stage' | 'unstage' | 'discard';

type UseHunkPatchActionsParams = {
  onRepoChanged?: () => void;
  t: CatalogTranslateFn;
};

export const useHunkPatchActions = ({ onRepoChanged, t }: UseHunkPatchActionsParams) => {
  const [hunkOpError, setHunkOpError] = useState<string | null>(null);

  const applyHunk = useCallback(
    async (hunk: ParsedHunk, fileHeader: string[], op: HunkPatchOperation) => {
      if (!gitClient.isAvailable()) return;
      setHunkOpError(null);
      try {
        const patch = buildHunkPatch(fileHeader, hunk);
        const result =
          op === 'stage'
            ? await gitClient.applyPatch(patch, { cached: true })
            : op === 'unstage'
              ? await gitClient.applyPatch(patch, { cached: true, reverse: true })
              : await gitClient.applyPatch(patch, { reverse: true });

        if (result.success) {
          onRepoChanged?.();
        } else {
          setHunkOpError(result.error || t('diffViewer.errors.hunkOperationFailed'));
        }
      } catch (error: unknown) {
        setHunkOpError(error instanceof Error ? error.message : t('diffViewer.errors.hunkOperationFailed'));
      }
    },
    [onRepoChanged, t],
  );

  return {
    hunkOpError,
    applyHunk,
  };
};
