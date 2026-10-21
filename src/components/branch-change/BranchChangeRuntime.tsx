import { useEffect, useRef } from 'react';
import { useGitStore } from '@/contexts/AppStateContext';
import { branchChangeClient } from '@/services/branchChangeClient';
import { getElectronApi } from '@/services/electronApi';
import { usePlannerWorkDialogState } from '@/components/project-planner/plannerWorkDialogState';
import { BranchChangeDialog } from './BranchChangeDialog';
import { requestParkedChanges, useBranchChangeDialogState } from './branchChangeDialogState';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export function BranchChangeRuntime({
  activeRepo,
  refreshSignal,
  onChanged,
  onWorktree,
}: {
  activeRepo: string | null;
  refreshSignal: number;
  onChanged(): void;
  onWorktree(path: string): void;
}) {
  const pending = useBranchChangeDialogState((state) => state.pending);
  const planner = usePlannerWorkDialogState((state) => state.target);
  const branch = useGitStore((state) => state.currentBranch);
  const offered = useRef(new Set<string>());
  const visit = useRef(new AbortController());
  useEffect(() => {
    offered.current = new Set();
    const controller = new AbortController();
    visit.current = controller;
    return () => controller.abort();
  }, [activeRepo, branch]);
  useEffect(() => {
    if (pending && normalizeRepoPathKey(pending.repoPath) !== normalizeRepoPathKey(activeRepo || '')) {
      void branchChangeClient.cancelBranchChange(pending.repoPath);
      pending.finish(null);
    }
  }, [activeRepo, pending]);
  useEffect(() => {
    if (!activeRepo || pending || planner || !getElectronApi()?.git?.listParkedBranchChanges) return;
    const controller = visit.current;
    let current = true;
    void branchChangeClient
      .listParkedBranchChanges(activeRepo)
      .then(async (response) => {
        if (!current || !response.success || controller.signal.aborted || document.querySelector('[role="dialog"]')) return;
        const sessions = response.data.filter(
          (entry) =>
            entry.currentWorktree &&
            (entry.sourceBranch === branch || ['applied', 'applying', 'conflict', 'preparing'].includes(entry.phase) || Boolean(entry.error)) &&
            !offered.current.has(entry.id),
        );
        sessions.forEach((session) => offered.current.add(session.id));
        for (const session of sessions) {
          if (controller.signal.aborted || useBranchChangeDialogState.getState().pending) return;
          offered.current.add(session.id);
          const result = await requestParkedChanges(activeRepo, session.id, controller.signal, sessions);
          if (result) onChanged();
          // One offer per visit; remaining entries remain accessible in Stashes.
          if (!result || result.restored) return;
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [activeRepo, branch, refreshSignal, pending, planner, onChanged]);
  return pending ? <BranchChangeDialog key={pending.id} dialog={pending} onChanged={onChanged} onWorktree={onWorktree} /> : null;
}
