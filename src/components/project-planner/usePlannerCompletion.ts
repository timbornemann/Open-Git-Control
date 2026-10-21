import { useCallback, useRef } from 'react';
import { activePlannerBranch } from '@/shared/plannerWork';
import type { PlannerItem, PlannerItemInput } from '@/types/projectPlanner';
import type { PlannerCommitMessageItem } from './usePlannerAiActions';

export function usePlannerCompletion(items: PlannerItem[], updateItem: (id: string, input: Partial<PlannerItemInput>) => Promise<boolean>) {
  const latest = useRef(items);
  latest.current = items;
  return useCallback(
    async (requested: PlannerCommitMessageItem[]) => {
      for (const item of requested) {
        const live = latest.current.find((entry) => entry.id === item.id);
        if (live && !activePlannerBranch(live) && live.status !== 'done') await updateItem(live.id, { status: 'done', expectedUpdatedAt: live.updatedAt });
      }
    },
    [updateItem],
  );
}
