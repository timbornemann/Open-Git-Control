import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkingTreeSnapshotDto, WorkingTreeStatsDto } from '../global';
import { parseGitStatusDetailed, type GitStatusDetailed } from '../utils/gitParsing';

export type WorkingTreeState = {
  snapshot: WorkingTreeSnapshotDto | null;
  status: GitStatusDetailed | null;
  stats: WorkingTreeStatsDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const useWorkingTreeSnapshot = (
  repoPath: string | null,
  refreshTrigger?: number,
): WorkingTreeState => {
  const [snapshot, setSnapshot] = useState<WorkingTreeSnapshotDto | null>(null);
  const [status, setStatus] = useState<GitStatusDetailed | null>(null);
  const [stats, setStats] = useState<WorkingTreeStatsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const generationRef = useRef(0);
  const snapshotRef = useRef<WorkingTreeSnapshotDto | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    const generation = generationRef.current;
    if (inFlightRef.current?.generation === generation) return inFlightRef.current.promise;
    let request!: Promise<void>;
    request = (async () => {
      setLoading((current) => current || !snapshotRef.current);
      try {
        if (typeof window.electronAPI.getWorkingTreeSnapshot === 'function') {
          const result = await window.electronAPI.getWorkingTreeSnapshot();
          if (generation !== generationRef.current) return;
          if (
            result.success
            && result.data.repoPath.toLowerCase() === repoPath.toLowerCase()
          ) {
            snapshotRef.current = result.data;
            setSnapshot(result.data);
            setStatus(parseGitStatusDetailed(result.data.statusRaw));
            setStats((current) => current?.snapshotId === result.data.snapshotId ? current : null);
            return;
          }
        }

        const fallback = await window.electronAPI.runGitCommand('statusPorcelain');
        if (generation !== generationRef.current || !fallback.success) return;
        snapshotRef.current = null;
        setSnapshot(null);
        setStatus(parseGitStatusDetailed(fallback.data || ''));
        setStats(null);
      } catch (error) {
        if (generation === generationRef.current) {
          console.error('Failed to refresh working tree status:', error);
        }
      }
    })().finally(() => {
      if (generation === generationRef.current) setLoading(false);
      if (inFlightRef.current?.promise === request) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = { generation, promise: request };
    return request;
  }, [repoPath]);

  useEffect(() => {
    generationRef.current += 1;
    snapshotRef.current = null;
    inFlightRef.current = null;
    setSnapshot(null);
    setStatus(null);
    setStats(null);
    if (!repoPath) return;

    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'hidden') {
        await refresh();
      }
      if (cancelled) return;
      const delay = snapshotRef.current?.largeMode ? 15_000 : 5_000;
      timer = window.setTimeout(poll, delay);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(poll, 0);
      }
    };

    void poll();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh, repoPath]);

  useEffect(() => {
    if (!repoPath || refreshTrigger === undefined) return;
    void refresh();
  }, [refresh, refreshTrigger, repoPath]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.electronAPI.getWorkingTreeStats(snapshot.snapshotId);
        if (
          cancelled
          || !result.success
          || snapshotRef.current?.snapshotId !== result.data.snapshotId
        ) return;
        setStats(result.data);
      } catch (error) {
        if (!cancelled) console.error('Failed to refresh working tree stats:', error);
      }
    }, 750);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [snapshot]);

  return { snapshot, status, stats, loading, refresh };
};
