import { useLayoutEffect, useMemo, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { useFileBlame } from '@/components/file-viewer/useFileBlame';

type Params = { repoPath: string | null; request: DiffRequest; refreshTrigger?: number };
export function useDiffBlame({ repoPath, request, refreshTrigger = 0 }: Params) {
  const [showBlame, setShowBlame] = useState(false);
  const context = useMemo(
    () => ({ repoPath: repoPath || '', path: request.path, source: request.source, commitHash: request.commitHash }),
    [repoPath, request.path, request.source, request.commitHash],
  );
  const blame = useFileBlame(context, showBlame && Boolean(repoPath), refreshTrigger, true);
  useLayoutEffect(() => {
    setShowBlame(false);
  }, [repoPath, request.path, request.source, request.commitHash]);
  return { showBlame, setShowBlame, blameMap: blame.loading || blame.error ? new Map() : blame.map, isBlameLoading: blame.loading, error: blame.error };
}
