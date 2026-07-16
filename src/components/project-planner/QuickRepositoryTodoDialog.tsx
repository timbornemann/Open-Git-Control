import React from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useI18n } from '@/i18n';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { ItemDialog } from './PlannerDialogs';

type QuickRepositoryTodoDialogProps = {
  requestId: number;
  activeRepo: string | null;
};

const repoKey = normalizeRepoPathKey;

export const QuickRepositoryTodoDialog: React.FC<QuickRepositoryTodoDialogProps> = ({ requestId, activeRepo }) => {
  const { data, loading, busy, createItem, createRepositoryProject, notify } = useProjectPlanner();
  const { tr } = useI18n();
  const [targetRepoPath, setTargetRepoPath] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [repositoryProjectConfirmationOpen, setRepositoryProjectConfirmationOpen] = React.useState(false);
  const handledRequestIdRef = React.useRef(requestId);

  const close = React.useCallback(() => {
    setTargetRepoPath(null);
    setProjectId(null);
    setRepositoryProjectConfirmationOpen(false);
  }, []);

  React.useEffect(() => {
    if (requestId === 0 || requestId === handledRequestIdRef.current) return;
    handledRequestIdRef.current = requestId;
    if (!activeRepo) {
      notify(tr('Bitte zuerst ein Repository oeffnen.', 'Please open a repository first.'), true);
      return;
    }
    setTargetRepoPath(activeRepo);
    setProjectId(null);
    setRepositoryProjectConfirmationOpen(false);
  }, [activeRepo, notify, requestId, tr]);

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
    if (!targetRepoPath || !activeRepo || repoKey(targetRepoPath) === repoKey(activeRepo)) return;
    close();
  }, [activeRepo, close, targetRepoPath]);

  const createProjectAndOpenTodo = async () => {
    if (!targetRepoPath) return;
    const project = await createRepositoryProject(targetRepoPath);
    if (!project) return;
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
        busy={busy}
        onClose={close}
        onSubmit={async (input) => {
          if (!projectId) return;
          const created = await createItem(projectId, input);
          if (created) close();
        }}
      />
    </>
  );
};
