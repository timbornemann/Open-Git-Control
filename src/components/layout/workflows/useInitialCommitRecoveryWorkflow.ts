import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { isWorkTreeRequiredError } from '@/utils/gitPushRecovery';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';

type Toast = { msg: string; isError: boolean };

type Params = {
  recoverBareRepoForPush: () => Promise<boolean>;
  setActiveTab: (tab: AppTabId) => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  language: AppLanguage;
};

export const useInitialCommitRecoveryWorkflow = ({ recoverBareRepoForPush, setActiveTab, setConfirmDialog, setGitActionToast, language }: Params) => {
  const { t, tr } = useLanguageTranslations(language);
  const ensureInitialCommitForPush = useCallback(
    async (options: { skipBareRepoRecovery?: boolean } = {}): Promise<boolean> => {
      if (!gitClient.isAvailable()) return false;

      const commitMessage = t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.initial_commit_de27cf34');
      const isIdentityMissingError = (message: string) =>
        /please tell me who you are/i.test(message) ||
        /unable to auto-detect email address/i.test(message) ||
        /user\.name/i.test(message) ||
        /user\.email/i.test(message);
      const isNothingToCommitError = (message: string) => /nothing to commit/i.test(message) || /working tree clean/i.test(message);

      const statusResult = await gitClient.getStatusPorcelain();
      const hasChanges = Boolean(statusResult.success && String(statusResult.data || '').trim().length > 0);

      if (hasChanges) {
        const addResult = await gitClient.stageAll();
        if (!addResult.success) {
          setGitActionToast({
            msg: addResult.error || t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.could_not_stage_changes_automatically_b576daaf'),
            isError: true,
          });
          return false;
        }
      }

      const commitResult = hasChanges ? await gitClient.commitMessage(commitMessage) : await gitClient.commitAllowEmpty(commitMessage);
      if (commitResult.success) {
        return true;
      }

      const commitError = String(commitResult.error || '');
      if (isNothingToCommitError(commitError)) {
        const emptyCommitResult = await gitClient.commitAllowEmpty(commitMessage);
        if (emptyCommitResult.success) {
          return true;
        }
        const emptyCommitError = String(emptyCommitResult.error || '');
        if (!options.skipBareRepoRecovery && isWorkTreeRequiredError(emptyCommitError)) {
          const recovered = await recoverBareRepoForPush();
          if (!recovered) {
            return false;
          }
          return ensureInitialCommitForPush({ skipBareRepoRecovery: true });
        }
        if (isIdentityMissingError(String(emptyCommitResult.error || ''))) {
          setActiveTab('repo');
          setGitActionToast({
            msg: t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.could_not_auto_prepare_push_missing_git_user_name_user_e_bb15207e'),
            isError: true,
          });
          return false;
        }
        setGitActionToast({
          msg: emptyCommitResult.error || t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.automatic_initial_commit_failed_04edc3ad'),
          isError: true,
        });
        return false;
      }

      if (!options.skipBareRepoRecovery && isWorkTreeRequiredError(commitError)) {
        const recovered = await recoverBareRepoForPush();
        if (!recovered) {
          return false;
        }
        return ensureInitialCommitForPush({ skipBareRepoRecovery: true });
      }

      if (isIdentityMissingError(commitError)) {
        setActiveTab('repo');
        setGitActionToast({
          msg: t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.could_not_auto_prepare_push_missing_git_user_name_user_e_bb15207e'),
          isError: true,
        });
        return false;
      }

      setGitActionToast({
        msg: commitResult.error || t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.automatic_initial_commit_failed_04edc3ad'),
        isError: true,
      });
      return false;
    },
    [recoverBareRepoForPush, setActiveTab, setGitActionToast, t],
  );

  const requestInitialCommitConfirmationIfNeeded = useCallback(
    async (params: { commandLabel: string; confirmLabel: string; onConfirm: () => Promise<void> }): Promise<boolean> => {
      if (!gitClient.isAvailable()) return false;

      let changedFiles: number | null = null;
      try {
        const statusResult = await gitClient.getStatusPorcelain();
        if (statusResult.success) {
          changedFiles = String(statusResult.data || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean).length;
        }
      } catch {
        changedFiles = null;
      }

      if (changedFiles === 0) {
        return false;
      }

      setActiveTab('repo');
      setConfirmDialog({
        variant: 'danger',
        title: t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.initial_commit_with_all_local_changes_0bd00588'),
        message: t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.this_repository_has_no_local_commit_yet_to_push_it_now_a_aa3b8ab1'),
        contextItems: [
          { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: params.commandLabel },
          {
            label: t('generated.components.layout.workflows.usegitcommandguardworkflow.local_changes_fc4435ff'),
            value:
              changedFiles === null
                ? t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.status_could_not_be_read_69bd4231')
                : tr(`${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} betroffen`, `${changedFiles} file${changedFiles === 1 ? '' : 's'} affected`),
          },
          {
            label: t('generated.components.layout.workflows.useinitialcommitrecoveryworkflow.automatic_step_54ebc5e4'),
            value: 'git add -A && git commit -m "Initial commit"',
          },
        ],
        irreversible: false,
        consequences: t(
          'generated.components.layout.workflows.useinitialcommitrecoveryworkflow.please_check_first_that_the_working_tree_does_not_contai_a7038b17',
        ),
        confirmLabel: params.confirmLabel,
        onConfirm: params.onConfirm,
      });
      return true;
    },
    [setActiveTab, setConfirmDialog, t, tr],
  );

  return {
    ensureInitialCommitForPush,
    requestInitialCommitConfirmationIfNeeded,
  };
};
