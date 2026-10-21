import { useEffect, useRef } from 'react';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { queryClient } from '@/data/queryClient';
import { plannerClient } from '@/services/plannerClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { activePlannerBranch } from '@/shared/plannerWork';
import { useHostingState } from '@/components/hosting/hostingState';
import { PlannerWorkDialog } from './PlannerWorkDialog';
import { usePlannerWorkDialogState } from './plannerWorkDialogState';
import '@/styles/planner-work.css';

/** Piggyback on repository/hosting updates; never owns a recurring poll. */
export function PlannerWorkRuntime({ activeRepo, refreshSignal, onChanged }: { activeRepo: string | null; refreshSignal: number; onChanged(): void }) {
  const { data } = useProjectPlanner();
  const hostingRevision = useHostingState((state) => state.revision);
  const tasks = data.items.filter((item) => {
    const project = data.projects.find((entry) => entry.id === item.projectId);
    return activeRepo && project?.repoPath && normalizeRepoPathKey(project.repoPath) === normalizeRepoPathKey(activeRepo) && activePlannerBranch(item);
  });
  const taskKey = JSON.stringify(tasks.map((item) => [item.id, item.references]));
  const latest = useRef({ activeRepo, tasks });
  const wake = useRef(() => {});
  latest.current = { activeRepo, tasks };
  useEffect(() => {
    if (!activeRepo) return;
    let current = true;
    void plannerClient
      .getWork({ repoPath: activeRepo, itemId: 'recovery-inventory', listRecoveries: true })
      .then((result) => {
        const recovery = result.success && result.data.recoveries?.[0];
        const state = usePlannerWorkDialogState.getState();
        if (current && recovery && !state.target) state.open(activeRepo, recovery.item);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [activeRepo, refreshSignal]);
  useEffect(() => {
    let current = true;
    let running = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!current || !activeRepo) return;
        if (running) {
          again = true;
          return;
        }
        running = true;
        void (async () => {
          try {
            do {
              again = false;
              for (const item of latest.current.tasks) {
                if (!current) return;
                if (latest.current.tasks.some((entry) => entry.id === item.id))
                  await plannerClient.refreshWork({ repoPath: activeRepo, itemId: item.id }).catch(() => undefined);
              }
            } while (current && again);
          } finally {
            running = false;
          }
        })();
      }, 150);
    };
    wake.current = refresh;
    refresh();
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const key = event.query.queryKey;
      if (
        key[1] === 'git' &&
        key[2] === normalizeRepoPathKey(activeRepo || '') &&
        ['getWorkingTreeSnapshot', 'getRepositoryChangeSummary', 'getBranches'].includes(String(key[3]))
      )
        refresh();
    });
    return () => {
      current = false;
      clearTimeout(timer);
      unsubscribe();
      wake.current = () => {};
    };
  }, [activeRepo]);
  useEffect(() => {
    wake.current();
  }, [refreshSignal, hostingRevision, taskKey]);
  return <PlannerWorkDialog activeRepo={activeRepo} onChanged={onChanged} />;
}
