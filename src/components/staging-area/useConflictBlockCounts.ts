import { useEffect, useRef, useState } from 'react';
import { normalizeMergeConflictFileContent } from '@/utils/conflictLineGutter';
import { gitClient } from '@/services/gitClient';
import { readCurrentResource } from '@/data/readCurrentResource';
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

    void (async () => {
      const next: Record<string, number> = {};
      try {
        for (const path of paths) {
          const result = await readCurrentResource(
            () => gitClient.readRepoFile(path, repoPath),
            () => !cancelled,
          );
          if (!result || cancelled) return;
          next[path] = result.success && typeof result.data === 'string' ? parseConflictBlocks(normalizeMergeConflictFileContent(result.data)).length : 0;
        }
        if (!cancelled) {
          countedConflictPathsKeyRef.current = pathsKey;
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
      } catch {
        // Counts are optional hints. Keep the last known counts on a read
        // failure and try again on the next status update.
      } finally {
        if (!cancelled) {
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
