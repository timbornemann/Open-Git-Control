import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { isNonFastForwardPushError, isPullBlockedByLocalChangesError } from '@/utils/gitPushRecovery';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';

type Toast = { msg: string; isError: boolean };

export type GitCommandRunner = (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;

type Params = {
  runGitCommandRef: MutableRefObject<GitCommandRunner | null>;
  setActiveTab: (tab: AppTabId) => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  language: AppLanguage;
};

type RemoteAheadQuickFixParams = {
  command: string;
  options?: RunGitCommandOptions;
};

type AutostashPullFlowParams = {
  args: string[];
  successMsg: string;
  actionLabel?: string;
  options?: RunGitCommandOptions;
};

type SyncMismatchFailureParams = AutostashPullFlowParams & {
  command: string;
  failureMessage: unknown;
};

export const useGitSyncRecoveryWorkflow = ({ runGitCommandRef, setActiveTab, setConfirmDialog, setGitActionToast, language }: Params) => {
  const { t, tr } = useLanguageTranslations(language);

  const runRemoteAheadQuickFix = useCallback(
    async ({ command, options }: RemoteAheadQuickFixParams): Promise<void> => {
      const runGitCommand = runGitCommandRef.current;
      if (!runGitCommand) return;

      const quickFixOptions: RunGitCommandOptions = {
        ...options,
        skipDirtyGuard: true,
        skipRemoteAheadDirtyGuard: true,
        skipSecretScan: true,
        skipSyncMismatchRecovery: true,
      };
      const quickFixStashMessage = 'Open Git Control quick sync fix';

      const stashed = await runGitCommand(
        ['stash', 'push', '-u', '-m', quickFixStashMessage],
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_saved_changes_to_stash_5cd00a52'),
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_creating_stash_3adb0717'),
        quickFixOptions,
      );
      if (!stashed) {
        return;
      }

      const pulled = await runGitCommand(
        ['pull', '--rebase'],
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_pull_rebase_completed_acf1dc5f'),
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_running_pull_rebase_394092f9'),
        quickFixOptions,
      );
      if (!pulled) {
        setGitActionToast({
          msg: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_stopped_pull_rebase_failed_your_changes_remain_72fa5cc7'),
          isError: true,
        });
        return;
      }

      const popped = await runGitCommand(
        ['stash', 'pop'],
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_stash_reapplied_5491de8e'),
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_reapplying_stash_3a51c601'),
        quickFixOptions,
      );
      if (!popped) {
        setGitActionToast({
          msg: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.quick_fix_nearly_finished_pull_rebase_succeeded_but_stas_ebdc2090'),
          isError: true,
        });
        return;
      }

      setGitActionToast({
        msg: tr(
          command === 'push'
            ? 'Quick-Fix abgeschlossen (stash -> pull --rebase -> stash pop). Du kannst jetzt erneut pushen.'
            : 'Quick-Fix abgeschlossen (stash -> pull --rebase -> stash pop).',
          command === 'push'
            ? 'Quick fix completed (stash -> pull --rebase -> stash pop). You can push again now.'
            : 'Quick fix completed (stash -> pull --rebase -> stash pop).',
        ),
        isError: false,
      });
    },
    [runGitCommandRef, setGitActionToast, tr],
  );

  const runAutostashPullFlow = useCallback(
    async ({ args, successMsg, actionLabel, options }: AutostashPullFlowParams): Promise<void> => {
      const runGitCommand = runGitCommandRef.current;
      if (!runGitCommand) return;

      const autostashOptions: RunGitCommandOptions = {
        ...options,
        skipDirtyGuard: true,
        skipRemoteAheadDirtyGuard: true,
        skipSecretScan: true,
        skipSyncMismatchRecovery: true,
      };
      const stashMessage = `Open Git Control autostash before pull: git ${args.join(' ')}`;

      const stashed = await runGitCommand(
        ['stash', 'push', '-u', '-m', stashMessage],
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_saved_local_changes_to_stash_eb2082e8'),
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_creating_stash_126e4d4f'),
        autostashOptions,
      );
      if (!stashed) {
        return;
      }

      const pulled = await runGitCommand(args, successMsg, actionLabel, autostashOptions);
      if (!pulled) {
        setGitActionToast({
          msg: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_stopped_pull_failed_your_changes_remain_safe_i_480071f0'),
          isError: true,
        });
        return;
      }

      const popped = await runGitCommand(
        ['stash', 'pop'],
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_stash_reapplied_34ac5813'),
        t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_reapplying_stash_ebfb337f'),
        autostashOptions,
      );
      if (!popped) {
        setGitActionToast({
          msg: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_nearly_finished_pull_succeeded_but_stash_pop_n_10cc91d3'),
          isError: true,
        });
        return;
      }

      setGitActionToast({
        msg: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.autostash_pull_completed_successfully_stash_pull_stash_p_a5a5ffa3'),
        isError: false,
      });
    },
    [runGitCommandRef, setGitActionToast, tr],
  );

  const maybeHandleSyncMismatchFailure = useCallback(
    ({ command, failureMessage, args, successMsg, actionLabel, options }: SyncMismatchFailureParams): boolean => {
      if (options?.skipSyncMismatchRecovery) {
        return false;
      }

      if (command === 'push' && isNonFastForwardPushError(failureMessage)) {
        setActiveTab('repo');
        setGitActionToast({
          msg: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.push_rejected_remote_is_newer_than_local_commit_or_stash_25113636'),
          isError: true,
        });
        return true;
      }

      if (command === 'pull' && isPullBlockedByLocalChangesError(failureMessage)) {
        setActiveTab('repo');
        setConfirmDialog({
          variant: 'danger',
          title: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.pull_blocked_by_uncommitted_changes_5d82ef95'),
          message: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.the_pull_was_aborted_because_uncommitted_changes_would_b_b29d9079'),
          contextItems: [
            { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git ${args.join(' ')}` },
            {
              label: t('generated.components.layout.workflows.usegitcommandguardworkflow.hint_5628c320'),
              value: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.your_local_uncommitted_changes_will_be_stashed_temporari_315cb6b7'),
            },
          ],
          irreversible: false,
          consequences: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.if_conflicts_occur_when_reapplying_the_stash_the_conflic_7a3c5c90'),
          confirmLabel: t('generated.components.layout.workflows.usegitsyncrecoveryworkflow.run_with_autostash_8a0fb6ae'),
          onConfirm: async () => {
            await runAutostashPullFlow({ args, successMsg, actionLabel, options });
          },
        });
        return true;
      }

      return false;
    },
    [runAutostashPullFlow, setActiveTab, setConfirmDialog, setGitActionToast, tr],
  );

  return {
    maybeHandleSyncMismatchFailure,
    runAutostashPullFlow,
    runRemoteAheadQuickFix,
  };
};
