import { useEffect, useRef, useState } from 'react';
import { normalizeMergeConflictFileContent } from '@/utils/conflictLineGutter';
import { gitClient } from '@/services/gitClient';
import { parseConflictBlocks } from './utils';
import type { GitStatusWithConflicts } from './types';

type Params = {
  repoPath: string | null;
  status: GitStatusWithConflicts | null;
};

export const useConflictBlockCounts = ({ repoPath, status }: Params) => {
  const [conflictBlockCountsByPath, setConflictBlockCountsByPath] = useState<Record<string, number>>({});
  const [isConflictBlockCountPending, setIsConflictBlockCountPending] = useState(false);
  const countedConflictPathsKeyRef = useRef<string>('');

  useEffect(() => {
    if (!repoPath || !gitClient.isAvailable() || !status?.conflicts?.length) {
      setConflictBlockCountsByPath({});
      setIsConflictBlockCountPending(false);
      countedConflictPathsKeyRef.current = '';
      return;
    }

    let cancelled = false;
    const paths = [...new Set(status.conflicts.map((conflict) => conflict.path))].sort();
    const pathsKey = `${repoPath}::${paths.join('\u0001')}`;
    const shouldShowPending = countedConflictPathsKeyRef.current !== pathsKey;
    if (shouldShowPending) {
      setIsConflictBlockCountPending(true);
    }

    (async () => {
      const next: Record<string, number> = {};
      try {
        for (const path of paths) {
          const result = await gitClient.readRepoFile(path, repoPath);
          if (cancelled) return;
          next[path] = result.success && typeof result.data === 'string' ? parseConflictBlocks(normalizeMergeConflictFileContent(result.data)).length : 0;
        }
        if (!cancelled) {
          setConflictBlockCountsByPath((prev) => {
            const normalized: Record<string, number> = {};
            let changed = Object.keys(prev).length !== paths.length;
            for (const path of paths) {
              const value = next[path] ?? 0;
              normalized[path] = value;
              if (prev[path] !== value) changed = true;
            }
            return changed ? normalized : prev;
          });
        }
      } finally {
        if (!cancelled) {
          countedConflictPathsKeyRef.current = pathsKey;
          setIsConflictBlockCountPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repoPath, status]);

  return {
    conflictBlockCountsByPath,
    isConflictBlockCountPending,
  };
};
