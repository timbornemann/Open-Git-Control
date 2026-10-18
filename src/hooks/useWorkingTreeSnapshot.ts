import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey, peekResource, invalidateResources, freshRead } from '@/data/clientCache';
import type { IpcResult } from '@/types/ipc';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WorkingTreeSnapshotDto, WorkingTreeStatsDto } from '@/types/gitDtos';
import { gitClient } from '@/services/gitClient';
import { parseGitStatusDetailed, type GitStatusDetailed } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { countStatusFiles, publishRepositoryActivity, markRepositoryActivityError } from '@/data/repositoryActivityCache';
import { queryClient } from '@/data/queryClient';
import { WorkingTreeRefreshSchedule } from './workingTreeRefreshSchedule';
import { getElectronApi } from '@/services/electronApi';
import { cancellableRead } from '@/data/ipcRead';

let nextWatchId = 0;

export type WorkingTreeState = {
  /** Repository that owns the currently exposed working-tree data. */
  dataRepoPath: string | null;
  snapshot: WorkingTreeSnapshotDto | null;
  status: GitStatusDetailed | null;
  statusRaw: string;
  stats: WorkingTreeStatsDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const useWorkingTreeSnapshot = (repoPath: string | null, refreshTrigger?: number, detailed = true): WorkingTreeState => {
  const cached = useCachedResult<IpcResult<WorkingTreeSnapshotDto>>(resourceKey('git', 'getWorkingTreeSnapshot', [repoPath]), detailed);
  const cachedSnapshot = cached.data?.success ? cached.data.data : null;
  const [snapshot, setSnapshot] = useState<WorkingTreeSnapshotDto | null>(null);
  const [status, setStatus] = useState<GitStatusDetailed | null>(null);
  const [statusRaw, setStatusRaw] = useState('');
  const [stats, setStats] = useState<WorkingTreeStatsDto | null>(null);
  const [dataRepoPath, setDataRepoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const queuedRefreshGenerationRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const snapshotRef = useRef<WorkingTreeSnapshotDto | null>(null);
  const statsRef = useRef<WorkingTreeStatsDto | null>(null);
  const statsRequestRef = useRef<{ generation: number; snapshotId: string; cancel: () => void } | null>(null);
  const detailedRef = useRef(detailed);
  const versionRef = useRef<string>();
  const triggerRef = useRef({ repoPath, refreshTrigger });
  detailedRef.current = detailed;

  const requestStats = useCallback((next: WorkingTreeSnapshotDto, generation: number) => {
    if (!detailedRef.current || document.visibilityState === 'hidden') return;
    if (statsRef.current?.snapshotId === next.snapshotId) return;
    if (statsRequestRef.current?.generation === generation && statsRequestRef.current.snapshotId === next.snapshotId) return;
    statsRequestRef.current?.cancel();
    let active = true;
    const controller = new AbortController();
    // Coalesce rapid staging clicks before starting a potentially expensive
    // repository-wide line count. Status and mutation completion never wait.
    const timer = setTimeout(() => {
      void cancellableRead(controller.signal, 'speculative', (request) =>
        request ? gitClient.getWorkingTreeStats(next.snapshotId, next.repoPath, request) : gitClient.getWorkingTreeStats(next.snapshotId, next.repoPath),
      )
        .then((result) => {
          if (!active || generation !== generationRef.current || snapshotRef.current?.snapshotId !== next.snapshotId || !result.success) return;
          if (result.data.snapshotId !== next.snapshotId) return;
          statsRef.current = result.data;
          setStats(result.data);
        })
        .catch(() => undefined)
        .finally(() => {
          if (statsRequestRef.current === request) statsRequestRef.current = null;
        });
    }, 300);
    const request = {
      generation,
      snapshotId: next.snapshotId,
      cancel: () => {
        active = false;
        controller.abort();
        clearTimeout(timer);
      },
    };
    statsRequestRef.current = request;
  }, []);

  useEffect(
    () => () => {
      generationRef.current += 1;
      statsRequestRef.current?.cancel();
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
      if (!detailedRef.current) {
        const summary = await freshRead(() => gitClient.getRepositoryChangeSummary(repoPath)).catch((error: unknown) => ({
          success: false as const,
          error: String(error),
        }));
        if (generation !== generationRef.current) return;
        if (summary.success && normalizeRepoPathKey(summary.data.repoPath) === normalizeRepoPathKey(repoPath)) {
          versionRef.current = `summary:${summary.data.changeCount}`;
          publishRepositoryActivity(repoPath, summary.data.changeCount, summary.data.checkedAt);
        } else {
          versionRef.current = undefined;
          markRepositoryActivityError(repoPath, summary.success ? 'Repository status belongs to another repository.' : summary.error);
        }
        return;
      }
      const quickStatusRequest = snapshotRef.current ? null : gitClient.runGitCommandForRepo(repoPath, 'statusPorcelain').catch(() => null);
      if (quickStatusRequest) {
        void quickStatusRequest
          .then((quickStatus) => {
            if (generation !== generationRef.current || snapshotRef.current || !quickStatus?.success) return;
            statsRef.current = null;
            setSnapshot(null);
            setDataRepoPath(repoPath);
            setStatusRaw(quickStatus.data || '');
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

      const result = await freshRead(() => gitClient.getWorkingTreeSnapshot(repoPath)).catch((error: unknown) => ({
        success: false as const,
        error: String(error),
      }));
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
        const sameSnapshot = snapshotRef.current?.snapshotId === nextSnapshot.snapshotId;
        versionRef.current = nextSnapshot.snapshotId;
        snapshotRef.current = sameSnapshot ? snapshotRef.current : nextSnapshot;
        setSnapshot((current) => (sameSnapshot && current ? current : nextSnapshot));
        setDataRepoPath(nextSnapshot.repoPath);
        setStatusRaw(nextSnapshot.statusRaw);
        // Keep the list identity on unchanged polls. Replacing it also starts
        // another LFS inspection and sorts every file again in the renderer.
        setStatus((current) => (sameSnapshot && current ? current : parseGitStatusDetailed(nextSnapshot.statusRaw)));
        publishRepositoryActivity(
          repoPath,
          nextSnapshot.changeCount,
          queryClient.getQueryState(resourceKey('git', 'getWorkingTreeSnapshot', [repoPath]))?.dataUpdatedAt || Date.now(),
        );
        if (statsRef.current?.snapshotId !== nextSnapshot.snapshotId) {
          statsRef.current = null;
          setStats(null);
          requestStats(nextSnapshot, generation);
        }
        return;
      }

      const quickStatus = quickStatusRequest ? await quickStatusRequest : null;
      const fallback = quickStatus?.success
        ? quickStatus
        : await gitClient.runGitCommandForRepo(repoPath, 'statusPorcelain').catch((error: unknown) => ({ success: false as const, error: String(error) }));
      if (generation !== generationRef.current) return;
      if (!fallback.success) {
        versionRef.current = undefined;
        markRepositoryActivityError(repoPath, fallback.error || 'Failed to read repository status.');
        return;
      }
      snapshotRef.current = null;
      versionRef.current = `status:${fallback.data || ''}`;
      statsRef.current = null;
      statsRequestRef.current?.cancel();
      statsRequestRef.current = null;
      setSnapshot(null);
      setDataRepoPath(repoPath);
      setStatusRaw(fallback.data || '');
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
      setLoading((current) => current || (detailedRef.current && !snapshotRef.current));
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
  }, [repoPath, requestStats]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    statsRequestRef.current?.cancel();
    statsRequestRef.current = null;
    queuedRefreshGenerationRef.current = null;
    const preview = peekResource<IpcResult<WorkingTreeSnapshotDto>>('git', 'getWorkingTreeSnapshot', [repoPath]);
    snapshotRef.current = preview?.success ? preview.data : null;
    versionRef.current = undefined;
    statsRef.current = null;
    inFlightRef.current = null;
    setSnapshot(null);
    setStatus(null);
    setStatusRaw('');
    setStats(null);
    setDataRepoPath(null);
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) return;
    let recursiveWatch = false;
    let stopped = false;
    const api = getElectronApi()?.git;
    const subscriptionId = `working-tree-${++nextWatchId}`;
    const schedule = new WorkingTreeRefreshSchedule(
      refresh,
      () => versionRef.current,
      () => ({ detailed, large: snapshotRef.current?.largeMode ?? false, recursiveWatch }),
      () => document.visibilityState !== 'hidden',
    );
    const watch = (enabled: boolean) => {
      if (!api?.watchWorkingTree) return;
      void api
        .watchWorkingTree({ repoPath, subscriptionId, enabled })
        .then((result) => {
          if (!stopped && result.success) recursiveWatch = result.data.recursive;
        })
        .catch(() => {
          recursiveWatch = false;
        });
    };
    const unsubscribe = api?.onWorkingTreeChanged?.((event) => {
      if (normalizeRepoPathKey(event.repoPath) !== normalizeRepoPathKey(repoPath)) return;
      if (event.rescan) recursiveWatch = false;
      schedule.changed();
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        watch(true);
        schedule.resumed();
      } else {
        watch(false);
        schedule.hidden();
        statsRequestRef.current?.cancel();
        statsRequestRef.current = null;
      }
    };
    const onFocus = () => schedule.resumed();
    if (!detailed) {
      statsRequestRef.current?.cancel();
      statsRequestRef.current = null;
    }
    watch(document.visibilityState !== 'hidden');
    schedule.start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      schedule.dispose();
      unsubscribe?.();
      watch(false);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, repoPath, detailed]);

  useEffect(() => {
    const previous = triggerRef.current;
    triggerRef.current = { repoPath, refreshTrigger };
    // The schedule owns initial loads and repository/mode changes. Only actual
    // mutation refreshes queue a second read behind an in-flight snapshot.
    if (!repoPath || refreshTrigger === undefined || previous.repoPath !== repoPath || previous.refreshTrigger === refreshTrigger) return;
    if (document.visibilityState === 'hidden') return;
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
    statusRaw: localDataMatches ? statusRaw : validPreview?.statusRaw || '',
    stats: currentStats,
    loading: detailed && (loading || Boolean(repoPath && !currentDataRepoPath)),
    refresh,
  };
};
