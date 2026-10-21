import { useCallback, useEffect, useRef, useState } from 'react';
import { plannerClient } from '@/services/plannerClient';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerUpdateWorkRequest, PlannerWorkDetails } from '@/types/plannerWork';

export type PlannerWorkAction<T = PlannerUpdateWorkRequest> = T extends unknown ? Omit<T, 'repoPath' | 'itemId' | 'expectedRevision'> : never;

export function usePlannerWorkDetails(repoPath: string, item: PlannerItem, onItemChanged: (item: PlannerItem) => void) {
  const [details, setDetails] = useState<PlannerWorkDetails>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const invalidate = useCallback(() => ++version.current, []);
  const read = useCallback(async () => {
    const current = ++version.current;
    const result = await plannerClient.getWork({ repoPath, itemId: item.id });
    if (current !== version.current) return;
    if (result.success) setDetails(result.data);
    else setError(result.error);
  }, [repoPath, item.id]);
  useEffect(() => {
    let current = true;
    const load = () => {
      void read()
        .catch((e: unknown) => {
          if (current) setError(String(e));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    };
    load();
    const unsubscribe = plannerClient.onDataChanged(load);
    return () => {
      current = false;
      invalidate();
      unsubscribe();
    };
  }, [read, item.updatedAt, invalidate]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = () =>
    run(async () => {
      const current = ++version.current;
      const result = await plannerClient.refreshWork({ repoPath, itemId: item.id });
      if (current !== version.current) return;
      if (result.success) setDetails(result.data);
      else setError(result.error);
    });
  const update = (action: PlannerWorkAction) =>
    run(async () => {
      const result = await plannerClient.updateWork({
        ...action,
        repoPath,
        itemId: item.id,
        expectedRevision: details?.revision || '',
      } as PlannerUpdateWorkRequest);
      if (!result.success) setError(result.error);
      else {
        onItemChanged(result.data);
        await read();
      }
    });
  return { details, busy, loading, error, refresh, update };
}
