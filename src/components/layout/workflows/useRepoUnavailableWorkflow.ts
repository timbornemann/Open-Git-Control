import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { gitClient } from '../../../services/gitClient';
import { plannerClient } from '../../../services/plannerClient';
import type { ConfirmDialogState } from '../layoutTypes';

type Toast = { msg: string; isError: boolean };

type Params = {
  activeRepo: string | null;
  handleCloseRepo: (repoPath: string) => Promise<void>;
  setPlannerRefreshSignal: Dispatch<SetStateAction<number>>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  language: AppLanguage;
};

export const useRepoUnavailableWorkflow = ({
  activeRepo,
  handleCloseRepo,
  setPlannerRefreshSignal,
  setConfirmDialog,
  setGitActionToast,
  language,
}: Params) => {
  const handlingRef = useRef<string | null>(null);
  const tr = (deText: string, enText: string) => trByLanguage(language, deText, enText);

  useEffect(() => {
    if (!gitClient.isAvailable()) return;

    const unsubscribe = gitClient.onRepoUnavailable(() => {
      const repoPath = activeRepo;
      if (!repoPath) return;
      if (handlingRef.current === repoPath) return;

      handlingRef.current = repoPath;
      const repoName = repoPath.split(/[\\/]/).pop() || repoPath;

      setConfirmDialog({
        variant: 'confirm',
        title: tr('Repository nicht mehr verfuegbar', 'Repository no longer available'),
        message: tr(
          'Dieses lokale Repository wurde verschoben, geloescht oder ist nicht mehr erreichbar. Open-Git-Control entfernt es aus der lokalen Liste und wechselt erst danach zu einem anderen Repository.',
          'This local repository was moved, deleted, or is no longer reachable. Open-Git-Control will remove it from the local list and only then switch to another repository.',
        ),
        contextItems: [
          { label: tr('Repository', 'Repository'), value: repoName },
          { label: tr('Pfad', 'Path'), value: repoPath },
        ],
        irreversible: false,
        consequences: tr(
          'Es werden keine Git-Dateien geloescht. Der gespeicherte Repo-Eintrag und zugehoerige Planungsdaten werden aus Open-Git-Control entfernt.',
          'No Git files will be deleted. The saved repo entry and related planning data will be removed from Open-Git-Control.',
        ),
        confirmLabel: tr('Entfernen und wechseln', 'Remove and switch'),
        onConfirm: async () => {
          let deletedPlanningItems = 0;
          let plannerCleanupError = '';
          try {
            if (plannerClient.isAvailable()) {
              const plannerResult = await plannerClient.deleteRepositoryProjectByPath(repoPath);
              if (plannerResult.success) {
                deletedPlanningItems = plannerResult.data.deletedItemCount;
                if (plannerResult.data.deletedProjectCount > 0) {
                  setPlannerRefreshSignal((current) => current + 1);
                }
              } else {
                plannerCleanupError = plannerResult.error;
              }
            }

            await handleCloseRepo(repoPath);
            setGitActionToast({
              msg: plannerCleanupError
                ? tr(
                  `Repository entfernt, aber Planungsdaten konnten nicht geloescht werden: ${plannerCleanupError}`,
                  `Repository was removed, but planning data could not be deleted: ${plannerCleanupError}`,
                )
                : deletedPlanningItems > 0
                  ? tr(
                    `Repository und ${deletedPlanningItems} Planungseintrag${deletedPlanningItems === 1 ? '' : 'e'} entfernt: ${repoName}`,
                    `Repository and ${deletedPlanningItems} planning item${deletedPlanningItems === 1 ? '' : 's'} removed: ${repoName}`,
                  )
                  : tr(
                    `Repository nicht mehr verfuegbar und entfernt: ${repoName}`,
                    `Repository is no longer available and was removed: ${repoName}`,
                  ),
              isError: Boolean(plannerCleanupError),
            });
          } finally {
            window.setTimeout(() => {
              if (handlingRef.current === repoPath) {
                handlingRef.current = null;
              }
            }, 800);
          }
        },
        onCancel: () => {
          if (handlingRef.current === repoPath) {
            handlingRef.current = null;
          }
        },
      });
    });

    return unsubscribe;
  }, [activeRepo, handleCloseRepo, language, setConfirmDialog, setGitActionToast, setPlannerRefreshSignal]);
};
