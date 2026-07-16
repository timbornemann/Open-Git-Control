import { useEffect, useRef, useState } from 'react';
import type { ConfirmDialogState } from '@/app/state/contracts';
import type { PlannerProject } from '@/types/projectPlanner';
import { normalizeRepoPathKey } from '@/utils/repoPath';

type UseRepositoryProjectPromptParams = {
  activeRepo: string | null;
  plannerActive: boolean;
  projects: PlannerProject[];
  loading: boolean;
  error: string | null;
  setConfirmDialog: (state: ConfirmDialogState | null) => void;
  tr: (deText: string, enText: string) => string;
  onConfirmRepositoryProject: (repoPath: string) => Promise<boolean>;
};

const repoKey = normalizeRepoPathKey;

export const useRepositoryProjectPrompt = ({
  activeRepo,
  plannerActive,
  projects,
  loading,
  error,
  setConfirmDialog,
  tr,
  onConfirmRepositoryProject,
}: UseRepositoryProjectPromptParams) => {
  const [plannerEntry, setPlannerEntry] = useState({ id: 0, repoPath: null as string | null });
  const plannerEntryIdRef = useRef(0);
  const wasPlannerActiveRef = useRef(false);
  const promptedPlannerEntryRef = useRef(0);
  const repositoryPromptOpenEntryRef = useRef(0);

  useEffect(() => {
    if (!plannerActive) {
      if (repositoryPromptOpenEntryRef.current) {
        setConfirmDialog(null);
        repositoryPromptOpenEntryRef.current = 0;
      }
      wasPlannerActiveRef.current = false;
      return;
    }
    if (wasPlannerActiveRef.current) return;
    wasPlannerActiveRef.current = true;
    setPlannerEntry({ id: ++plannerEntryIdRef.current, repoPath: activeRepo });
  }, [activeRepo, plannerActive, setConfirmDialog]);

  useEffect(() => {
    if (!plannerActive || !plannerEntry.id || !plannerEntry.repoPath || loading || error) return;
    const hasRepositoryProject = projects.some((project) => project.repoPath && repoKey(project.repoPath) === repoKey(plannerEntry.repoPath!));
    if (hasRepositoryProject) return;
    if (promptedPlannerEntryRef.current === plannerEntry.id) return;

    const { id: entryId, repoPath } = plannerEntry;
    promptedPlannerEntryRef.current = entryId;
    repositoryPromptOpenEntryRef.current = entryId;
    setConfirmDialog({
      variant: 'confirm',
      title: tr('Repository zur Projektplanung hinzufuegen?', 'Add repository to project planning?'),
      message: tr(
        'Fuer dieses Repository gibt es noch kein Planungsprojekt. Moechtest du es jetzt zur Projektplanung hinzufuegen?',
        'This repository does not have a planning project yet. Would you like to add it to project planning now?',
      ),
      contextItems: [{ label: tr('Repository', 'Repository'), value: repoPath }],
      irreversible: false,
      consequences: tr(
        'Ohne Bestaetigung wird kein Planungsprojekt angelegt. Du kannst es beim naechsten Wechsel in die Projektplanung erneut hinzufuegen.',
        'No planning project will be created without confirmation. You can add it the next time you open project planning.',
      ),
      confirmLabel: tr('Projekt hinzufuegen', 'Add project'),
      onConfirm: async () => {
        repositoryPromptOpenEntryRef.current = 0;
        await onConfirmRepositoryProject(repoPath);
      },
      onCancel: () => {
        if (repositoryPromptOpenEntryRef.current === entryId) {
          repositoryPromptOpenEntryRef.current = 0;
        }
      },
    });
  }, [error, loading, onConfirmRepositoryProject, plannerActive, plannerEntry, projects, setConfirmDialog, tr]);
};
