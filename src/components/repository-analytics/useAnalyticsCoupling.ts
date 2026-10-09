import { useEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import type { AnalyticsCoupling, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { couplingPairKey } from './analyticsCouplingLayout';

export function useAnalyticsCoupling(snapshot: RepositoryAnalyticsSnapshot) {
  const [state, setState] = useState({ rows: snapshot.coupling, pending: true, loaded: 0, total: null as number | null, error: '' });
  const [retry, setRetry] = useState(0);
  const complete = useRef(false);
  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, pending: true, loaded: 0, error: '' }));
    const load = async () => {
      const collected = new Map<string, AnalyticsCoupling>();
      let offset = 0,
        total = Infinity;
      while (active && offset < total) {
        const result = await gitClient.getRepositoryAnalyticsDetails({
          repoPath: snapshot.repoPath,
          snapshotId: snapshot.id,
          kind: 'coupling',
          offset,
          limit: 200,
        });
        if (!active) return;
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
        // Replace a complete old report only when its entire successor is ready.
        // The first load extends the same network progressively.
        setState((previous) => ({
          rows: finished || !complete.current ? [...collected.values()] : previous.rows,
          pending: !finished,
          loaded: offset,
          total,
          error: '',
        }));
        if (finished) complete.current = true;
      }
    };
    void load().catch((error: unknown) => {
      if (active) setState((previous) => ({ ...previous, pending: false, error: error instanceof Error ? error.message : String(error) }));
    });
    return () => {
      active = false;
    };
  }, [snapshot.id, snapshot.savedAt, snapshot.repoPath, retry]);
  return { ...state, retry: () => setRetry((value) => value + 1) };
}
