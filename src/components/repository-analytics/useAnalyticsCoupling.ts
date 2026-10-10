import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { gitClient } from '@/services/gitClient';
import type { AnalyticsCoupling, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { couplingPairKey } from './analyticsCouplingLayout';
import { couplingContextKey, couplingDataVersion, couplingSession, type CouplingSession } from './analyticsCouplingSession';

function loadCoupling(session: CouplingSession, snapshot: RepositoryAnalyticsSnapshot, retry: number) {
  const version = couplingDataVersion(snapshot);
  const attempt = JSON.stringify([snapshot.id, snapshot.savedAt, retry]);
  if (
    (session.data?.complete && session.data.version === version) ||
    (session.task?.version === version && session.task.active) ||
    session.failedAttempt === attempt
  )
    return;
  if (session.task) session.task.active = false;
  const task = { version, active: true };
  session.task = task;
  const partial = session.partial?.version === version ? session.partial : undefined;
  const collected = new Map<string, AnalyticsCoupling>((partial?.rows ?? []).map((row) => [couplingPairKey(row), row]));
  const preserveComplete = !!session.data?.complete;
  const publish = () => {
    for (const listener of session.listeners) listener();
  };
  session.data = { ...session.data!, pending: true, loaded: partial?.offset ?? 0, total: partial?.total ?? null, error: '' };
  publish();
  const load = async () => {
    let offset = partial?.offset ?? 0,
      total = partial?.total ?? Infinity;
    while (task.active && offset < total) {
      const result = await gitClient.getRepositoryAnalyticsDetails({
        repoPath: snapshot.repoPath,
        snapshotId: snapshot.id,
        kind: 'coupling',
        offset,
        limit: 200,
      });
      if (!task.active) return;
      if (!result.success || !result.data) throw new Error(result.error || 'Unable to load file connections.');
      const batch = result.data;
      if (batch.offset !== offset || !Number.isSafeInteger(batch.total) || batch.total < 0 || (Number.isFinite(total) && batch.total !== total))
        throw new Error('The connection report changed while loading.');
      total = batch.total;
      if (!batch.items.length && offset < total) throw new Error('The connection report is incomplete.');
      for (const row of batch.items) {
        if (!('first' in row)) throw new Error('Invalid file connection data.');
        collected.set(couplingPairKey(row), row);
      }
      offset += batch.items.length;
      const finished = offset >= total;
      const rows = [...collected.values()];
      session.partial = finished ? undefined : { version, rows, offset, total };
      session.data = {
        version: finished || !preserveComplete ? version : session.data!.version,
        rows: finished || !preserveComplete ? rows : session.data!.rows,
        complete: finished || preserveComplete,
        pending: !finished,
        loaded: offset,
        total,
        error: '',
      };
      if (finished) {
        task.active = false;
        session.task = undefined;
        session.failedAttempt = undefined;
      }
      publish();
    }
  };
  void load().catch((error: unknown) => {
    if (!task.active) return;
    task.active = false;
    session.task = undefined;
    session.failedAttempt = attempt;
    session.data = { ...session.data!, pending: false, error: error instanceof Error ? error.message : String(error) };
    publish();
  });
}

export function useAnalyticsCoupling(snapshot: RepositoryAnalyticsSnapshot) {
  const sessionKey = couplingContextKey(snapshot);
  const session = couplingSession(sessionKey)!;
  const version = couplingDataVersion(snapshot);
  session.data ??= { version, rows: snapshot.coupling, complete: false, pending: true, loaded: 0, total: null, error: '' };
  const [retry, setRetry] = useState(0);
  const subscribe = useCallback(
    (listener: () => void) => {
      session.listeners.add(listener);
      return () => {
        session.listeners.delete(listener);
        if (!session.listeners.size && session.task) {
          session.task.active = false;
          session.task = undefined;
        }
      };
    },
    [session],
  );
  const getSnapshot = useCallback(() => session.data!, [session]);
  const state = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadCoupling(session, snapshot, retry);
  }, [session, snapshot, retry, state.error]);
  return {
    ...state,
    sessionKey,
    retry: () => {
      session.failedAttempt = undefined;
      // A failed batch is retryable, but a valid full report stays cached.
      setRetry((value) => value + 1);
    },
  };
}
