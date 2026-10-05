import { useEffect, useRef, useState } from 'react';
import { useResourceState } from '@/data/resourceHooks';
import { gitClient } from '@/services/gitClient';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import type { GitFileHistoryEntryDto } from '@/types/git';
import { fileViewerIdentity } from './fileViewerRequest';

export function useFileHistory(context: RepositoryFileContextDto, active: boolean, refreshTrigger = 0) {
  const { repoPath, path, source, commitHash } = context;
  const commit = source === 'commit' ? commitHash : undefined;
  const identity = fileViewerIdentity(context);
  const [entries, setEntries, hasData] = useResourceState<GitFileHistoryEntryDto[]>('git', 'getFileHistory', [path, commit, 80, repoPath], []);
  const [loading, setLoading] = useState(false);
  const hasDataRef = useRef(hasData);
  hasDataRef.current = hasData;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setError(null);
    setLoading(active && !hasDataRef.current);
    if (active && gitClient.isAvailable())
      void gitClient
        .getFileHistory(path, commit, 80, repoPath)
        .then((result) => {
          if (!current) return;
          if (result.success) setEntries(result.data || []);
          else setError(result.error || 'Could not load file history.');
        })
        .catch((error) => {
          if (current) setError(error instanceof Error ? error.message : 'Could not load file history.');
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    return () => {
      current = false;
    };
  }, [active, identity, path, commit, repoPath, refreshTrigger, setEntries]);
  return { entries, loading, error };
}
