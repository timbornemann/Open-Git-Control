import React from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useI18n } from '@/i18n';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import type { PlannerItemInput } from '@/types/projectPlanner';
import { ItemDialog } from './PlannerDialogs';
import { useRepositoryTodoDraftState } from './repositoryTodoDraftState';

type QuickRepositoryTodoDialogProps = {
  requestId: number;
  activeRepo: string | null;
  preferSelectedProject?: boolean;
};

const repoKey = normalizeRepoPathKey;

export const QuickRepositoryTodoDialog: React.FC<QuickRepositoryTodoDialogProps> = ({ requestId, activeRepo, preferSelectedProject = false }) => {
  const { data, loading, busy, createItem, createRepositoryProject, notify, selectedProjectId } = useProjectPlanner();
  const { tr } = useI18n();
  const draftRequest = useRepositoryTodoDraftState((state) => state.request);
  const consumeDraftRequest = useRepositoryTodoDraftState((state) => state.consume);
  const [initialInput, setInitialInput] = React.useState<PlannerItemInput>();
  const [targetRepoPath, setTargetRepoPath] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [repositoryProjectConfirmationOpen, setRepositoryProjectConfirmationOpen] = React.useState(false);
  const handledRequestIdRef = React.useRef(requestId);
  const generationRef = React.useRef(0);

  const close = React.useCallback(() => {
    generationRef.current += 1;
    setTargetRepoPath(null);
    setProjectId(null);
    setInitialInput(undefined);
    setRepositoryProjectConfirmationOpen(false);
  }, []);

  React.useEffect(() => {
    if (requestId === 0 || requestId === handledRequestIdRef.current || (preferSelectedProject && loading)) return;
    handledRequestIdRef.current = requestId;
    if (preferSelectedProject && selectedProjectId) {
      generationRef.current += 1;
      setTargetRepoPath(null);
      setInitialInput(undefined);
      setProjectId(selectedProjectId);
      setRepositoryProjectConfirmationOpen(false);
      return;
    }
    if (!activeRepo) {
      notify(
        tr('Bitte zuerst ein Repository öffnen oder im Planner ein Projekt auswählen.', 'Please open a repository or select a project in the planner first.'),
        true,
      );
      return;
    }
    setTargetRepoPath(activeRepo);
    generationRef.current += 1;
    setInitialInput(undefined);
    setProjectId(null);
    setRepositoryProjectConfirmationOpen(false);
  }, [activeRepo, notify, requestId, tr, loading, preferSelectedProject, selectedProjectId]);

  React.useEffect(() => {
    if (!draftRequest) return;
    consumeDraftRequest(draftRequest);
    if (!activeRepo || repoKey(activeRepo) !== repoKey(draftRequest.repoPath)) {
      notify(tr('Bitte zuerst das zugehörige Repository öffnen.', 'Please open the associated repository first.'), true);
      return;
    }
    generationRef.current += 1;
    setTargetRepoPath(draftRequest.repoPath);
    setInitialInput(draftRequest.input);
    setProjectId(null);
    setRepositoryProjectConfirmationOpen(false);
  }, [activeRepo, consumeDraftRequest, draftRequest, notify, tr]);

  React.useEffect(() => {
    if (!targetRepoPath || loading || projectId || repositoryProjectConfirmationOpen) return;
    const project = data.projects.find((candidate) => candidate.repoPath && repoKey(candidate.repoPath) === repoKey(targetRepoPath));
    if (project) {
      setProjectId(project.id);
      return;
    }
    setRepositoryProjectConfirmationOpen(true);
  }, [data.projects, loading, projectId, repositoryProjectConfirmationOpen, targetRepoPath]);

  React.useEffect(() => {
    if (!targetRepoPath || (activeRepo && repoKey(targetRepoPath) === repoKey(activeRepo))) return;
    close();
  }, [activeRepo, close, targetRepoPath]);

  const createProjectAndOpenTodo = async () => {
    if (!targetRepoPath) return;
    const generation = generationRef.current;
    const project = await createRepositoryProject(targetRepoPath);
    if (!project || generation !== generationRef.current) return;
    setRepositoryProjectConfirmationOpen(false);
    setProjectId(project.id);
  };

  return (
    <>
      <DialogFrame
        open={repositoryProjectConfirmationOpen}
        title={tr('Projektplanung fuer dieses Repository aktivieren?', 'Enable project planning for this repository?')}
        onClose={close}
        onConfirm={() => void createProjectAndOpenTodo()}
        onEnter={() => void createProjectAndOpenTodo()}
        confirmLabel={tr('Projekt hinzufuegen', 'Add project')}
        confirmDisabled={busy}
      >
        <p className="dialog-message">
          {tr(
            'Zum Anlegen eines Todos wird ein Planungsprojekt fuer dieses Repository benoetigt. Es wird erst nach deiner Bestaetigung angelegt.',
            'A planning project is required to create a todo. It will only be created after your confirmation.',
          )}
        </p>
        <dl className="dialog-context-list">
          <dt>{tr('Repository', 'Repository')}</dt>
          <dd>{targetRepoPath}</dd>
        </dl>
      </DialogFrame>

      <ItemDialog
        open={Boolean(projectId)}
        initialInput={initialInput}
        busy={busy}
        onClose={close}
        onSubmit={async (input) => {
          if (!projectId) return;
          const generation = generationRef.current;
          const created = await createItem(projectId, input);
          if (created && generation === generationRef.current) close();
        }}
      />
    </>
  );
};
