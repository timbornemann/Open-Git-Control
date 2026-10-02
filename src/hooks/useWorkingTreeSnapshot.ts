import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey, peekResource, invalidateResources } from '@/data/clientCache';
import type { IpcResult } from '@/types/ipc';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WorkingTreeSnapshotDto, WorkingTreeStatsDto } from '@/types/gitDtos';
import { gitClient } from '@/services/gitClient';
import { parseGitStatusDetailed, type GitStatusDetailed } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { countStatusFiles, publishRepositoryActivity, markRepositoryActivityError } from '@/data/repositoryActivityCache';
import { queryClient } from '@/data/queryClient';

export type WorkingTreeState = {
  /** Repository that owns the currently exposed working-tree data. */
  dataRepoPath: string | null;
  snapshot: WorkingTreeSnapshotDto | null;
  status: GitStatusDetailed | null;
  stats: WorkingTreeStatsDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const useWorkingTreeSnapshot = (repoPath: string | null, refreshTrigger?: number): WorkingTreeState => {
  const cached = useCachedResult<IpcResult<WorkingTreeSnapshotDto>>(resourceKey('git', 'getWorkingTreeSnapshot', [repoPath]));
  const cachedSnapshot = cached.data?.success ? cached.data.data : null;
  const [snapshot, setSnapshot] = useState<WorkingTreeSnapshotDto | null>(null);
  const [status, setStatus] = useState<GitStatusDetailed | null>(null);
  const [stats, setStats] = useState<WorkingTreeStatsDto | null>(null);
  const [dataRepoPath, setDataRepoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const queuedRefreshGenerationRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const snapshotRef = useRef<WorkingTreeSnapshotDto | null>(null);
  const statsRef = useRef<WorkingTreeStatsDto | null>(null);

  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const generation = generationRef.current;
    if (inFlightRef.current?.generation === generation) {
      queuedRefreshGenerationRef.current = generation;
      return inFlightRef.current.promise;
    }

    const performRefresh = async () => {
      const quickStatusRequest = snapshotRef.current ? null : gitClient.runGitCommandForRepo(repoPath, 'statusPorcelain').catch(() => null);
      if (quickStatusRequest) {
        void quickStatusRequest
          .then((quickStatus) => {
            if (generation !== generationRef.current || snapshotRef.current || !quickStatus?.success) return;
            statsRef.current = null;
            setSnapshot(null);
            setDataRepoPath(repoPath);
            setStatus(parseGitStatusDetailed(quickStatus.data || ''));
            publishRepositoryActivity(
              repoPath,
              countStatusFiles(quickStatus.data || ''),
              queryClient.getQueryState(resourceKey('git', 'runGitCommandForRepo', [repoPath, 'statusPorcelain']))?.dataUpdatedAt || Date.now(),
            );
            setStats(null);
          })
          .catch(() => undefined);
      }

      const result = await gitClient.getWorkingTreeSnapshot(repoPath).catch((error: unknown) => ({ success: false as const, error: String(error) }));
      if (generation !== generationRef.current) return;
      if (result.success && normalizeRepoPathKey(result.data.repoPath) === normalizeRepoPathKey(repoPath)) {
        const nextSnapshot = result.data;
        if (snapshotRef.current && snapshotRef.current.snapshotId !== nextSnapshot.snapshotId) {
          invalidateResources('git', normalizeRepoPathKey(repoPath), [
            'getDiffPreview',
            'listWorkingDirectory',
            'getWorkingDirectoryPreview',
            'getFileHistory',
            'getFileBlame',
            'getFileBlameRange',
            'readRepoFile',
          ]);
        }
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
        setDataRepoPath(nextSnapshot.repoPath);
        setStatus(parseGitStatusDetailed(nextSnapshot.statusRaw));
        publishRepositoryActivity(
          repoPath,
          nextSnapshot.changeCount,
          queryClient.getQueryState(resourceKey('git', 'getWorkingTreeSnapshot', [repoPath]))?.dataUpdatedAt || Date.now(),
        );
        if (statsRef.current?.snapshotId !== nextSnapshot.snapshotId) {
          statsRef.current = null;
          setStats(null);
          const statsResult = await gitClient.getWorkingTreeStats(nextSnapshot.snapshotId, repoPath);
          if (generation !== generationRef.current || !statsResult.success || snapshotRef.current?.snapshotId !== statsResult.data.snapshotId) return;
          statsRef.current = statsResult.data;
          setStats(statsResult.data);
        }
        return;
      }

      const quickStatus = quickStatusRequest ? await quickStatusRequest : null;
      const fallback = quickStatus?.success
        ? quickStatus
        : await gitClient.runGitCommandForRepo(repoPath, 'statusPorcelain').catch((error: unknown) => ({ success: false as const, error: String(error) }));
      if (generation !== generationRef.current) return;
      if (!fallback.success) {
        markRepositoryActivityError(repoPath, fallback.error || 'Failed to read repository status.');
        return;
      }
      snapshotRef.current = null;
      statsRef.current = null;
      setSnapshot(null);
      setDataRepoPath(repoPath);
      setStatus(parseGitStatusDetailed(fallback.data || ''));
      publishRepositoryActivity(
        repoPath,
        countStatusFiles(fallback.data || ''),
        queryClient.getQueryState(resourceKey('git', 'runGitCommandForRepo', [repoPath, 'statusPorcelain']))?.dataUpdatedAt || Date.now(),
      );
      setStats(null);
    };

    let request!: Promise<void>;
    request = (async () => {
      setLoading((current) => current || !snapshotRef.current);
      do {
        queuedRefreshGenerationRef.current = null;
        try {
          await performRefresh();
        } catch (error) {
          if (generation === generationRef.current) {
            console.error('Failed to refresh working tree status:', error);
          }
        }
      } while (generation === generationRef.current && queuedRefreshGenerationRef.current === generation);
    })().finally(() => {
      if (generation === generationRef.current) setLoading(false);
      if (inFlightRef.current?.promise === request) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = { generation, promise: request };
    return request;
  }, [repoPath]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    queuedRefreshGenerationRef.current = null;
    const preview = peekResource<IpcResult<WorkingTreeSnapshotDto>>('git', 'getWorkingTreeSnapshot', [repoPath]);
    snapshotRef.current = preview?.success ? preview.data : null;
    statsRef.current = null;
    inFlightRef.current = null;
    setSnapshot(null);
    setStatus(null);
    setStats(null);
    setDataRepoPath(null);
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
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

  const localDataMatches = repoPath && dataRepoPath && normalizeRepoPathKey(repoPath) === normalizeRepoPathKey(dataRepoPath);
  const validPreview = repoPath && cachedSnapshot && normalizeRepoPathKey(cachedSnapshot.repoPath) === normalizeRepoPathKey(repoPath) ? cachedSnapshot : null;
  const currentDataRepoPath = localDataMatches ? dataRepoPath : validPreview?.repoPath || null;
  const currentSnapshot = localDataMatches ? snapshot : validPreview;
  const currentStatus = localDataMatches ? status : validPreview ? parseGitStatusDetailed(validPreview.statusRaw) : null;
  const currentStats = currentSnapshot && stats?.snapshotId === currentSnapshot.snapshotId ? stats : null;

  return {
    dataRepoPath: currentDataRepoPath,
    snapshot: currentSnapshot,
    status: currentStatus,
    stats: currentStats,
    loading: loading || Boolean(repoPath && !currentDataRepoPath),
    refresh,
  };
};
