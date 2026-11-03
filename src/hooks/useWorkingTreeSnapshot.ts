import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey, peekResource, invalidateResources, freshRead, withReadPriority } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import { publishRepositoryActivity, markRepositoryActivityError } from '@/data/repositoryActivityCache';
import type { IpcResult } from '@/types/ipc';
import type { WorkingTreeSnapshotDto, WorkingTreeStatsDto, WorkingTreeStatusDto } from '@/types/gitDtos';
import { gitClient } from '@/services/gitClient';
import { getElectronApi } from '@/services/electronApi';
import { parseGitStatusDetailed, type GitStatusDetailed } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { cancellableRead } from '@/data/ipcRead';
import { isReadCancellation } from '@/data/readCancellation';
import { WorkingTreeRefreshSchedule } from './workingTreeRefreshSchedule';

let nextWatchId = 0;
const contentReads = [
  'getDiffPreview',
  'listWorkingDirectory',
  'getWorkingDirectoryPreview',
  'getFileHistory',
  'getFileBlame',
  'getFileBlameRange',
  'readRepoFile',
];

export type WorkingTreeState = {
  dataRepoPath: string | null;
  snapshot: WorkingTreeSnapshotDto | null;
  status: GitStatusDetailed | null;
  statusRaw: string;
  stats: WorkingTreeStatsDto | null;
  loading: boolean;
  /** Resolves after a fresh status, independently of optional detail reads. */
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
  const generationRef = useRef(0);
  const detailedRef = useRef(detailed);
  const largeRef = useRef(false);
  const failedRef = useRef(false);
  const snapshotRef = useRef<WorkingTreeSnapshotDto | null>(null);
  const rawRef = useRef<string | null>(null);
  const statsRef = useRef<WorkingTreeStatsDto | null>(null);
  const versionRef = useRef<string>();
  const detailRevisionRef = useRef(0);
  const detailRef = useRef<{ timer: ReturnType<typeof setTimeout>; controller: AbortController } | null>(null);
  const inFlightRef = useRef<{ generation: number; promise: Promise<void>; controller: AbortController } | null>(null);
  const queuedRef = useRef<number | null>(null);
  const triggerRef = useRef({ repoPath, refreshTrigger });
  detailedRef.current = detailed;

  const cancelDetails = useCallback(() => {
    detailRevisionRef.current++;
    if (detailRef.current) {
      clearTimeout(detailRef.current.timer);
      detailRef.current.controller.abort();
      detailRef.current = null;
    }
  }, []);
  const applyStatus = useCallback((next: WorkingTreeStatusDto | WorkingTreeSnapshotDto) => {
    const changed = rawRef.current !== next.statusRaw;
    if (changed && rawRef.current !== null) invalidateResources('git', normalizeRepoPathKey(next.repoPath), contentReads);
    rawRef.current = next.statusRaw;
    largeRef.current = next.changeCount >= 250;
    failedRef.current = false;
    setDataRepoPath(next.repoPath);
    setStatusRaw(next.statusRaw);
    setStatus((current) => (current && !changed ? current : parseGitStatusDetailed(next.statusRaw)));
    if (changed || queryClient.getQueryState(resourceKey('git', 'getWorkingTreeSnapshot', [next.repoPath]))?.isInvalidated) {
      setSnapshot(null);
      setStats(null);
      statsRef.current = null;
    }
    if (changed) versionRef.current = `status:${next.statusRaw}`;
    publishRepositoryActivity(next.repoPath, next.changeCount, 'checkedAt' in next ? next.checkedAt : Date.now());
  }, []);

  const scheduleDetails = useCallback(
    (generation: number) => {
      cancelDetails();
      if (!repoPath || !detailedRef.current || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      const revision = detailRevisionRef.current;
      const current = () => !controller.signal.aborted && generation === generationRef.current && revision === detailRevisionRef.current;
      let confirmed: WorkingTreeSnapshotDto | null = null;
      let attempts = 0;
      const run = () => {
        void (async () => {
          if (!confirmed) {
            const result = await cancellableRead(controller.signal, 'speculative', (request) =>
              withReadPriority(
                () => freshRead(() => (request ? gitClient.getWorkingTreeSnapshot(repoPath, request) : gitClient.getWorkingTreeSnapshot(repoPath))),
                'speculative',
              ),
            );
            if (!current()) return;
            if (!result.success) {
              if (isReadCancellation(result.error)) throw new Error(result.error);
              return;
            }
            if (normalizeRepoPathKey(result.data.repoPath) !== normalizeRepoPathKey(repoPath)) return;
            const next = result.data;
            const previous = snapshotRef.current;
            if (snapshotRef.current && snapshotRef.current.snapshotId !== next.snapshotId)
              invalidateResources('git', normalizeRepoPathKey(repoPath), contentReads);
            applyStatus(next);
            const same = previous?.snapshotId === next.snapshotId;
            snapshotRef.current = same ? previous : next;
            if (previous && !same && previous.statusRaw === next.statusRaw) versionRef.current = `content:${next.snapshotId}`;
            setSnapshot((current) => (same && current ? current : next));
            confirmed = next;
          }
          const next = confirmed;
          if (statsRef.current?.snapshotId === next.snapshotId) return;
          setStats(null);
          const counted = await cancellableRead(controller.signal, 'speculative', (request) =>
            withReadPriority(
              () => (request ? gitClient.getWorkingTreeStats(next.snapshotId, repoPath, request) : gitClient.getWorkingTreeStats(next.snapshotId, repoPath)),
              'speculative',
            ),
          );
          if (!current()) return;
          if (!counted.success) {
            if (isReadCancellation(counted.error)) throw new Error(counted.error);
            return;
          }
          if (counted.data.snapshotId !== next.snapshotId) return;
          statsRef.current = counted.data;
          setStats(counted.data);
        })().catch((error: unknown) => {
          if (current() && isReadCancellation(error)) detailRef.current = { timer: setTimeout(run, Math.min(300 * 2 ** attempts++, 5000)), controller };
        });
      };
      detailRef.current = { timer: setTimeout(run, 300), controller };
    },
    [applyStatus, cancelDetails, repoPath],
  );

  const refresh = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const generation = generationRef.current;
    if (inFlightRef.current?.generation === generation) {
      queuedRef.current = generation;
      return inFlightRef.current.promise;
    }
    cancelDetails();
    const controller = new AbortController();
    let request!: Promise<void>;
    request = (async () => {
      setLoading((value) => value || (detailedRef.current && rawRef.current === null));
      let failure: unknown;
      let failed = false;
      do {
        queuedRef.current = null;
        failed = false;
        try {
          if (!detailedRef.current) {
            const result = await freshRead(() => gitClient.getRepositoryChangeSummary(repoPath)).catch((error: unknown) => ({
              success: false as const,
              error: String(error),
            }));
            if (generation !== generationRef.current) return;
            if (result.success && normalizeRepoPathKey(result.data.repoPath) === normalizeRepoPathKey(repoPath)) {
              versionRef.current = result.data.statusFingerprint || `summary:${result.data.changeCount}`;
              publishRepositoryActivity(repoPath, result.data.changeCount, result.data.checkedAt);
            } else {
              versionRef.current = undefined;
              markRepositoryActivityError(repoPath, result.success ? 'Repository status belongs to another repository.' : result.error);
            }
          } else {
            const result = await cancellableRead(controller.signal, 'visible', (readRequest) =>
              freshRead(() => (readRequest ? gitClient.getWorkingTreeStatus(repoPath, readRequest) : gitClient.getWorkingTreeStatus(repoPath))),
            );
            if (generation !== generationRef.current) return;
            if (!result.success || normalizeRepoPathKey(result.data.repoPath) !== normalizeRepoPathKey(repoPath))
              throw new Error(result.success ? 'Repository status belongs to another repository.' : result.error);
            applyStatus(result.data);
          }
        } catch (error) {
          failure = error;
          failed = true;
        }
      } while (generation === generationRef.current && queuedRef.current === generation);
      if (failed) throw failure;
      if (generation === generationRef.current) scheduleDetails(generation);
    })()
      .catch((error: unknown) => {
        if (generation !== generationRef.current) return;
        versionRef.current = undefined;
        failedRef.current = true;
        markRepositoryActivityError(repoPath, error instanceof Error ? error.message : String(error));
        setDataRepoPath(null);
        setStatus(null);
        setSnapshot(null);
        setStats(null);
        rawRef.current = null;
        throw error;
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
        if (inFlightRef.current?.promise === request) inFlightRef.current = null;
      });
    inFlightRef.current = { generation, promise: request, controller };
    return request;
  }, [applyStatus, cancelDetails, repoPath, scheduleDetails]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    inFlightRef.current?.controller.abort();
    cancelDetails();
    const preview = peekResource<IpcResult<WorkingTreeSnapshotDto>>('git', 'getWorkingTreeSnapshot', [repoPath]);
    snapshotRef.current = preview?.success ? preview.data : null;
    rawRef.current = null;
    statsRef.current = null;
    versionRef.current = undefined;
    queuedRef.current = null;
    inFlightRef.current = null;
    failedRef.current = false;
    largeRef.current = false;
    setSnapshot(null);
    setStatus(null);
    setStatusRaw('');
    setStats(null);
    setDataRepoPath(null);
    setLoading(false);
    return () => {
      generationRef.current += 1;
      inFlightRef.current?.controller.abort();
      cancelDetails();
    };
  }, [cancelDetails, repoPath]);

  useEffect(() => {
    if (!repoPath) return;
    let recursiveWatch = false;
    let stopped = false;
    const api = getElectronApi()?.git;
    const subscriptionId = `working-tree-${++nextWatchId}`;
    const schedule = new WorkingTreeRefreshSchedule(
      refresh,
      () => versionRef.current,
      () => ({ detailed, large: (snapshotRef.current?.largeMode ?? false) || largeRef.current, recursiveWatch }),
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
      cancelDetails();
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
        cancelDetails();
      }
    };
    const onFocus = () => schedule.resumed();
    if (!detailed) cancelDetails();
    watch(document.visibilityState !== 'hidden');
    schedule.start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      schedule.dispose();
      unsubscribe?.();
      watch(false);
      cancelDetails();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, repoPath, detailed, cancelDetails]);

  useEffect(() => {
    const previous = triggerRef.current;
    triggerRef.current = { repoPath, refreshTrigger };
    if (
      !repoPath ||
      refreshTrigger === undefined ||
      previous.repoPath !== repoPath ||
      previous.refreshTrigger === refreshTrigger ||
      document.visibilityState === 'hidden'
    )
      return;
    void refresh().catch(() => {});
  }, [refresh, refreshTrigger, repoPath]);

  const local = Boolean(repoPath && dataRepoPath && normalizeRepoPathKey(repoPath) === normalizeRepoPathKey(dataRepoPath));
  const preview =
    !failedRef.current &&
    rawRef.current === null &&
    repoPath &&
    cachedSnapshot &&
    normalizeRepoPathKey(cachedSnapshot.repoPath) === normalizeRepoPathKey(repoPath)
      ? cachedSnapshot
      : null;
  const currentSnapshot = local ? snapshot : preview;
  return {
    dataRepoPath: local ? dataRepoPath : preview?.repoPath || null,
    snapshot: currentSnapshot,
    status: local ? status : preview ? parseGitStatusDetailed(preview.statusRaw) : null,
    statusRaw: local ? statusRaw : preview?.statusRaw || '',
    stats: currentSnapshot && stats?.snapshotId === currentSnapshot.snapshotId ? stats : null,
    loading: detailed && (loading || Boolean(repoPath && !local && !preview)),
    refresh,
  };
};
