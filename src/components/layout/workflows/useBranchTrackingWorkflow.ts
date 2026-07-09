import { useCallback } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { parseRemoteBranchRef } from '@/utils/gitParsing';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import { gitWorkflowCommands } from './gitWorkflowCommands';

type Toast = { msg: string; isError: boolean };

type RunGitCommand = (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;

type Params = {
  activeRepo: string | null;
  currentBranch: string;
  runGitCommand: RunGitCommand;
  setGitActionToast: (toast: Toast) => void;
  language: AppLanguage;
};

export const useBranchTrackingWorkflow = ({ activeRepo, currentBranch, runGitCommand, setGitActionToast, language }: Params) => {
  const { t, tr } = useLanguageTranslations(language);

  const handleSetUpstreamForCurrentBranch = useCallback(async () => {
    if (!activeRepo || !currentBranch) return;

    const setTracking = await runGitCommand(
      gitWorkflowCommands.setUpstreamForBranch(currentBranch),
      tr(`Tracking gesetzt: ${currentBranch} -> origin/${currentBranch}`, `Tracking set: ${currentBranch} -> origin/${currentBranch}`),
    );

    if (!setTracking) {
      await runGitCommand(
        gitWorkflowCommands.pushBranchWithUpstream(currentBranch),
        tr(`Branch ${currentBranch} mit Upstream gepusht.`, `Pushed branch ${currentBranch} with upstream.`),
      );
    }
  }, [activeRepo, currentBranch, runGitCommand, tr]);

  const handleCheckoutRemoteBranch = useCallback(
    async (remoteBranchName: string) => {
      const normalized = (remoteBranchName || '').trim();
      if (!normalized) return;

      const parsed = parseRemoteBranchRef(normalized);
      if (!parsed) {
        setGitActionToast({
          msg: t('generated.components.layout.useappstate.invalid_remote_branch_3042f288'),
          isError: true,
        });
        return;
      }

      const { remoteRef, localBranchName } = parsed;
      const createdTrackingBranch = await runGitCommand(
        gitWorkflowCommands.checkoutRemoteTrackingBranch(remoteRef),
        tr(`Branch ${localBranchName} aus ${remoteRef} ausgecheckt.`, `Checked out branch ${localBranchName} from ${remoteRef}.`),
      );

      if (createdTrackingBranch) return;

      await runGitCommand(
        gitWorkflowCommands.checkoutBranch(localBranchName),
        tr(`Branch ${localBranchName} ausgecheckt.`, `Checked out branch ${localBranchName}.`),
      );
    },
    [runGitCommand, setGitActionToast, t, tr],
  );

  return {
    handleCheckoutRemoteBranch,
    handleSetUpstreamForCurrentBranch,
  };
};
