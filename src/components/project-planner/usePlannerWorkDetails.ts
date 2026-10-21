import { useCallback, useEffect, useRef, useState } from 'react';
import { plannerClient } from '@/services/plannerClient';
import { useI18n } from '@/i18n';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerUpdateWorkRequest, PlannerWorkDetails } from '@/types/plannerWork';

export type PlannerWorkAction<T = PlannerUpdateWorkRequest> = T extends unknown ? Omit<T, 'repoPath' | 'itemId' | 'expectedRevision'> : never;

export function usePlannerWorkDetails(repoPath: string, item: PlannerItem, onItemChanged: (item: PlannerItem) => void) {
  const { tr } = useI18n();
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
  const applyUpdate = async (action: PlannerWorkAction, expectedRevision: string) => {
    const result = await plannerClient.updateWork({ ...action, repoPath, itemId: item.id, expectedRevision } as PlannerUpdateWorkRequest);
    if (!result.success) setError(result.error);
    else {
      onItemChanged(result.data);
      await read();
    }
  };
  const update = (action: PlannerWorkAction) => run(() => applyUpdate(action, details?.revision || ''));
  const activateAfterPr = () =>
    run(async () => {
      // PR creation can outlive a background task/PR-link refresh. Read the
      // current revision while keeping activation bound to the original workflow.
      const latest = await plannerClient.getWork({ repoPath, itemId: item.id });
      if (!latest.success) throw new Error(latest.error);
      if (!latest.data.revision || !latest.data.workflowId || latest.data.workflowId !== item.references?.activeWorkflowId)
        throw new Error(
          tr(
            'Die Branch-Zuordnung hat sich während der PR-Erstellung geändert. Prüfe den Aufgaben-Workflow.',
            'The branch assignment changed during PR creation. Review the task workflow.',
          ),
        );
      await applyUpdate({ action: 'automation', paused: false }, latest.data.revision);
    });
  return { details, busy, loading, error, refresh, update, activateAfterPr };
}
