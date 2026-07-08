import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { translateFromCatalog, trByLanguage, type AppLanguage, type TranslationVariables } from '../../../i18n';
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
  const t = (key: string, variables?: TranslationVariables) => translateFromCatalog(language, key, variables);

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
        title: t('generated.components.layout.workflows.userepounavailableworkflow.repository_no_longer_available_f884544b'),
        message: t('generated.components.layout.workflows.userepounavailableworkflow.this_local_repository_was_moved_deleted_or_is_no_longer_1849146a'),
        contextItems: [
          { label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'), value: repoName },
          { label: t('generated.components.layout.hooks.useworkspacedomain.path_f9011584'), value: repoPath },
        ],
        irreversible: false,
        consequences: t('generated.components.layout.workflows.userepounavailableworkflow.no_git_files_will_be_deleted_the_saved_repo_entry_and_re_ba819d24'),
        confirmLabel: t('generated.components.layout.workflows.userepounavailableworkflow.remove_and_switch_72371909'),
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
