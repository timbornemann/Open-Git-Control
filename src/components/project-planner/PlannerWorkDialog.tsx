import { useEffect, useRef, useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { activePlannerBranch } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { usePlannerWorkDialogState, type PlannerWorkDialogTarget } from './plannerWorkDialogState';
import { PlannerWorkSetupDialog } from './PlannerWorkSetupDialog';
import { PlannerWorkPanel } from './PlannerWorkPanel';
import '@/styles/project-planner.css';
import '@/styles/planner-work.css';

function WorkflowDialog({ target, onChanged }: { target: PlannerWorkDialogTarget; onChanged(): void }) {
  const { data } = useProjectPlanner();
  const { tr } = useI18n();
  const close = usePlannerWorkDialogState((state) => state.close);
  const reportedBranch = useGitStore((state) => state.currentBranch);
  const [checkedOutBranch, setCheckedOutBranch] = useState<string>();
  const currentBranch = checkedOutBranch || reportedBranch;
  const [updatedItem, setUpdatedItem] = useState(target.item);
  const [setup, setSetup] = useState(target.setup || !activePlannerBranch(target.item));
  const [creatingPr, setCreatingPr] = useState(false);
  const overviewFocus = useRef<HTMLHeadingElement>(null);
  const prFocus = useRef<HTMLHeadingElement>(null);
  const initialFocusRef = creatingPr ? prFocus : overviewFocus;
  const liveItem = data.items.find((entry) => entry.id === target.item.id && entry.projectId === target.item.projectId);
  const item = liveItem && liveItem.updatedAt >= updatedItem.updatedAt ? liveItem : updatedItem;
  useEffect(() => setCheckedOutBranch(undefined), [reportedBranch]);
  const onItemChanged = (value: PlannerItem) => {
    setUpdatedItem(value);
    onChanged();
  };
  if (setup)
    return (
      <PlannerWorkSetupDialog
        target={target}
        currentBranch={currentBranch}
        onChanged={onChanged}
        onComplete={(value, branchName) => {
          if (value) setUpdatedItem(value);
          if (branchName) setCheckedOutBranch(branchName);
          setSetup(false);
        }}
        onClose={() => (activePlannerBranch(item) ? setSetup(false) : close())}
      />
    );
  return (
    <DialogFrame
      open
      initialFocusRef={initialFocusRef}
      title={creatingPr ? tr('PR erstellen', 'Create PR') : tr('Aufgaben-Workflow', 'Task workflow')}
      onClose={creatingPr ? () => setCreatingPr(false) : close}
      cancelLabel={creatingPr ? tr('Zur Übersicht', 'Back to overview') : target.onNavigate ? tr('Zur Aufgabe', 'Back to item') : tr('Schließen', 'Close')}
    >
      <PlannerWorkPanel
        repoPath={target.repoPath}
        item={item}
        currentBranch={currentBranch}
        headingRef={initialFocusRef}
        creatingPr={creatingPr}
        onCreatePrChange={setCreatingPr}
        onSetup={() => setSetup(true)}
        onItemChanged={onItemChanged}
        onNavigate={() => {
          target.onNavigate?.();
          close();
        }}
      />
    </DialogFrame>
  );
}

export function PlannerWorkDialog({ activeRepo, onChanged }: { activeRepo: string | null; onChanged(): void }) {
  const { target, close } = usePlannerWorkDialogState();
  const matches = target && normalizeRepoPathKey(activeRepo || '') === normalizeRepoPathKey(target.repoPath);
  useEffect(() => {
    if (target && !matches) close();
  }, [target, matches, close]);
  return matches ? <WorkflowDialog key={`${target.repoPath}:${target.item.id}`} target={target} onChanged={onChanged} /> : null;
}
