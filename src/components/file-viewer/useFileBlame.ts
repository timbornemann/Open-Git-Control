import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlamePreview } from '@/data/useBlamePreview';
import { gitClient } from '@/services/gitClient';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '@/components/file-details/blamePagination';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import { fileViewerIdentity } from './fileViewerRequest';

export function useFileBlame(context: RepositoryFileContextDto, active: boolean, refreshTrigger = 0, all = false) {
  const { repoPath, path, source, commitHash } = context;
  const commit = source === 'commit' ? commitHash : undefined;
  const mode = source === 'commit' ? undefined : source;
  const identity = fileViewerIdentity(context);
  const preview = useBlamePreview(repoPath, path, commit, mode);
  const { setLines, setHasMore, hasData } = preview;
  const hasDataRef = useRef(hasData);
  hasDataRef.current = hasData;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const busyRef = useRef<number | null>(null);
  const load = useCallback(
    async (start: number, append: boolean, generation: number) => {
      if (busyRef.current === generation) return;
      busyRef.current = generation;
      setLoading(true);
      setError(null);
      try {
        const result = all
          ? await gitClient.getFileBlame(path, commit, repoPath, mode)
          : await gitClient.getFileBlameRange(path, commit, start, BLAME_LOOKAHEAD_COUNT, repoPath, mode);
        if (generationRef.current !== generation) return;
        if (!result.success) {
          setError(result.error || 'Could not load blame data.');
          return;
        }
        const page = all ? { lines: result.data || [], hasMore: false } : splitBlamePage(result.data || []);
        setLines((old) => (append ? [...old, ...page.lines] : page.lines));
        setHasMore(page.hasMore);
      } catch (error) {
        if (generationRef.current === generation) setError(error instanceof Error ? error.message : 'Could not load blame data.');
      } finally {
        if (busyRef.current === generation) busyRef.current = null;
        if (generationRef.current === generation) setLoading(false);
      }
    },
    [all, path, commit, repoPath, mode, setLines, setHasMore],
  );
  useEffect(() => {
    const generation = ++generationRef.current;
    busyRef.current = null;
    setLoading(active && !hasDataRef.current);
    setError(null);
    if (active && gitClient.isAvailable()) void load(1, false, generation);
    return () => {
      generationRef.current += 1;
    };
  }, [active, identity, refreshTrigger, load]);
  const loadMore = useCallback(() => {
    if (active && preview.hasMore && busyRef.current === null) void load(preview.lines.length + 1, true, generationRef.current);
  }, [active, load, preview.hasMore, preview.lines.length]);
  const map = useMemo(() => new Map(preview.lines.map((line) => [line.lineNumber, line])), [preview.lines]);
  return { lines: preview.lines, hasMore: preview.hasMore, loading, error, loadMore, map };
}
