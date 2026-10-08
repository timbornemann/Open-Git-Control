import { useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { plannerClient } from '@/services/plannerClient';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { normalizeRepoPathKey } from '@/utils/repoPath';

type Toast = { msg: string; isError: boolean };

type Params = {
  activeRepo: string | null;
  handleCloseRepo: (repoPath: string) => Promise<void>;
  handleRecoverRepo: (repoPath: string, selectNewLocation: boolean) => Promise<boolean>;
  setPlannerRefreshSignal: Dispatch<SetStateAction<number>>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  language: AppLanguage;
};

export const useRepoUnavailableWorkflow = ({
  activeRepo,
  handleCloseRepo,
  handleRecoverRepo,
  setPlannerRefreshSignal,
  setConfirmDialog,
  setGitActionToast,
  language,
}: Params) => {
  const handlingRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const activeRef = useRef(activeRepo);
  const mountedRef = useRef(true);
  const { t, tr } = useLanguageTranslations(language);
  useLayoutEffect(() => {
    activeRef.current = activeRepo;
    if (handlingRef.current && normalizeRepoPathKey(handlingRef.current) !== normalizeRepoPathKey(activeRepo || '')) handlingRef.current = null;
  }, [activeRepo]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!gitClient.isAvailable()) return;

    const unsubscribe = gitClient.onRepoUnavailable((payload) => {
      const repoPath = payload.repoPath;
      if (!activeRepo || normalizeRepoPathKey(repoPath) !== normalizeRepoPathKey(activeRepo)) return;
      if (handlingRef.current === repoPath || pendingRef.current) return;

      handlingRef.current = repoPath;
      const repoName = repoPath.split(/[\\/]/).pop() || repoPath;

      const isCurrent = () => mountedRef.current && normalizeRepoPathKey(activeRef.current || '') === normalizeRepoPathKey(repoPath);
      const removeDialog: ConfirmDialogState = {
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
          if (!isCurrent()) return;
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
                  : tr(`Repository nicht mehr verfuegbar und entfernt: ${repoName}`, `Repository is no longer available and was removed: ${repoName}`),
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
      };
      const recover = async (selectNewLocation: boolean) => {
        if (!isCurrent() || pendingRef.current) return;
        pendingRef.current = true;
        try {
          const restored = await handleRecoverRepo(repoPath, selectNewLocation);
          if (!mountedRef.current) return;
          if (restored) {
            if (handlingRef.current === repoPath) handlingRef.current = null;
            setPlannerRefreshSignal((value) => value + 1);
            setGitActionToast({ msg: tr(`Repository wieder verfügbar: ${repoName}`, `Repository is available again: ${repoName}`), isError: false });
          } else if (isCurrent()) showRecovery();
        } catch (error) {
          if (!isCurrent()) return;
          setGitActionToast({
            msg: tr(
              `Repository konnte nicht geöffnet werden: ${String(error instanceof Error ? error.message : error)}`,
              `Could not reopen repository: ${String(error instanceof Error ? error.message : error)}`,
            ),
            isError: true,
          });
          showRecovery();
        } finally {
          pendingRef.current = false;
          if (!isCurrent() && handlingRef.current === repoPath) handlingRef.current = null;
        }
      };
      const showRecovery = () => {
        if (!isCurrent()) return;
        handlingRef.current = repoPath;
        setConfirmDialog({
          ...removeDialog,
          title: tr('Repository nicht verfügbar', 'Repository unavailable'),
          message: tr(
            'Das Repository ist am gespeicherten Pfad nicht erreichbar. Wähle den neuen Speicherort oder prüfe den bisherigen Pfad erneut.',
            'The repository cannot be reached at its saved path. Choose its new location or recheck the previous path.',
          ),
          consequences: tr(
            'Beim Wiederfinden bleiben der gespeicherte Eintrag, Einstellungen und Planungsdaten erhalten.',
            'Locating the repository again preserves its saved entry, settings and planning data.',
          ),
          confirmLabel: tr('Neuen Speicherort auswählen', 'Choose new location'),
          focusConfirm: true,
          onConfirm: () => recover(true),
          secondaryActionLabel: tr('Erneut prüfen', 'Recheck'),
          onSecondaryAction: () => recover(false),
          contextAction: {
            label: tr('Repository entfernen…', 'Remove repository…'),
            onClick: () => {
              if (!isCurrent()) return;
              handlingRef.current = repoPath;
              setConfirmDialog(removeDialog);
            },
          },
        });
      };
      showRecovery();
    });

    return unsubscribe;
  }, [activeRepo, handleCloseRepo, handleRecoverRepo, language, setConfirmDialog, setGitActionToast, setPlannerRefreshSignal, t, tr]);
};
