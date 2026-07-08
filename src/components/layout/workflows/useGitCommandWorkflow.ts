import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import {
  isMergeInProgressError,
  resolveConflictPathAfterGitFailure,
} from '../../../utils/gitParsing';
import {
  isMissingUpstreamPushError,
  isNoLocalCommitPushError,
} from '../../../utils/gitPushRecovery';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '../layoutTypes';
import { type RunGitCommandOptions } from '../state/appStateShared';
import { useGitCommandGuardWorkflow } from './useGitCommandGuardWorkflow';
import { useGitSyncRecoveryWorkflow, type GitCommandRunner } from './useGitSyncRecoveryWorkflow';
import { useRemoteRecoveryWorkflow } from './useRemoteRecoveryWorkflow';

type Toast = { msg: string; isError: boolean };

type WorkspaceBridge = {
  activeRepo: string | null;
  addOpenRepo: (repoPath: string) => Promise<void>;
  setActiveRepo: Dispatch<SetStateAction<string | null>>;
  setActiveTab: (tab: AppTabId) => void;
};

type Params = {
  workspace: WorkspaceBridge;
  settings: Pick<AppSettingsDto,
    | 'confirmDangerousOps'
    | 'defaultBranch'
    | 'language'
    | 'secretScanBeforePushEnabled'
  >;
  triggerRefresh: () => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  setConflictResolverPath: (path: string) => void;
};

export const useGitCommandWorkflow = ({
  workspace,
  settings,
  triggerRefresh,
  setConfirmDialog,
  setGitActionToast,
  setConflictResolverPath,
}: Params) => {
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const [activeGitCommand, setActiveGitCommand] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);
  const runGitCommandRef = useRef<GitCommandRunner | null>(null);

  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(settings.language as AppLanguage, deText, enText);
  }, [settings.language]);

  const {
    connectError,
    createGithubRepoAndConnect,
    ensureInitialCommitForPush,
    forceGithubRepoCreationPrompt,
    isConnectingGithubRepo,
    maybeHandlePushWithoutOrigin,
    maybeRecoverRemoteSetup,
    newRepoDescription,
    newRepoName,
    newRepoPrivate,
    requestInitialCommitConfirmationIfNeeded,
    setConnectError,
    setForceGithubRepoCreationPrompt,
    setNewRepoDescription,
    setNewRepoName,
    setNewRepoPrivate,
  } = useRemoteRecoveryWorkflow({
    workspace,
    settings,
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
  });

  const {
    maybeHandleSyncMismatchFailure,
    runRemoteAheadQuickFix,
  } = useGitSyncRecoveryWorkflow({
    runGitCommandRef,
    setActiveTab: workspace.setActiveTab,
    setConfirmDialog,
    setGitActionToast,
    language: settings.language,
  });

  const { runGitCommandGuards } = useGitCommandGuardWorkflow({
    runGitCommandRef,
    runRemoteAheadQuickFix,
    settings,
    setConfirmDialog,
    setGitActionToast,
  });

  const runGitCommand = useCallback(async (
    args: string[],
    successMsg: string,
    actionLabel?: string,
    options?: RunGitCommandOptions,
  ): Promise<boolean> => {
    if (!window.electronAPI || !workspace.activeRepo || args.length === 0) return false;

    const command = args[0];
    const tryAutoSetUpstreamPush = async (failureMessage: unknown): Promise<boolean> => {
      if (command !== 'push' || options?.skipAutoSetUpstreamOnPushFailure || !isMissingUpstreamPushError(failureMessage)) {
        return false;
      }

      const fallbackArgs = ['push', ...args.slice(1), '-u', 'origin', 'HEAD'];
      const fallbackSuccess = await runGitCommand(
        fallbackArgs,
        tr('Branch gepusht und Upstream gesetzt.', 'Pushed branch and set upstream.'),
        tr('Push mit Upstream wird ausgefuehrt...', 'Running push with upstream...'),
        { ...options, skipAutoSetUpstreamOnPushFailure: true },
      );
      return fallbackSuccess;
    };
    if (await maybeHandlePushWithoutOrigin({ command, options })) {
      return false;
    }

    if (await runGitCommandGuards({ args, command, successMsg, actionLabel, options })) {
      return false;
    }
    setIsGitActionRunning(true);
    setActiveGitCommand(command);
    setActiveGitActionLabel(actionLabel || tr(`Git ${command} wird ausgefÃ¼hrt...`, `Running git ${command}...`));

    try {
      const r = await window.electronAPI.runGitCommand(command, ...args.slice(1));
      if (r.success) {
        if (forceGithubRepoCreationPrompt && (command === 'push' || command === 'pull' || command === 'fetch')) {
          setForceGithubRepoCreationPrompt(false);
          setConnectError(null);
        }
        setGitActionToast({ msg: successMsg, isError: false });
        triggerRefresh();
        return true;
      }
      if (command === 'push' && isNoLocalCommitPushError(r.error)) {
        if (options?.skipAutoInitialCommitOnPushFailure) {
          workspace.setActiveTab('repo');
          setGitActionToast({
            msg: tr(
              'Push nicht moeglich: Es gibt noch keinen lokalen Commit. Bitte zuerst committen.',
              'Push not possible: there is no local commit yet. Please commit first.',
            ),
            isError: true,
          });
          return false;
        }

        if (!options?.confirmedAutoInitialCommit) {
          const confirmationOpened = await requestInitialCommitConfirmationIfNeeded({
            commandLabel: `git ${args.join(' ')}`,
            confirmLabel: tr('Alle Aenderungen committen und pushen', 'Commit all changes and push'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, {
                ...options,
                confirmedAutoInitialCommit: true,
              });
            },
          });
          if (confirmationOpened) {
            return false;
          }
        }

        const prepared = await ensureInitialCommitForPush();
        if (!prepared) {
          return false;
        }

        const argsWithUpstream = args.some((arg) => arg === '-u' || arg === '--set-upstream')
          ? args
          : ['push', '-u', 'origin', 'HEAD'];

        return runGitCommand(
          argsWithUpstream,
          tr('Initial-Commit erstellt und gepusht.', 'Initial commit created and pushed.'),
          tr('Initial-Commit wird gepusht...', 'Pushing initial commit...'),
          {
            ...options,
            confirmedAutoInitialCommit: true,
            skipAutoInitialCommitOnPushFailure: true,
            skipAutoSetUpstreamOnPushFailure: true,
          },
        );
      }
      const missingUpstream = isMissingUpstreamPushError(r.error);
      if (await tryAutoSetUpstreamPush(r.error)) {
        return true;
      }
      if (missingUpstream) {
        return false;
      }
      if (await maybeRecoverRemoteSetup({ command, options, failureMessage: r.error })) {
        return false;
      }
      if (maybeHandleSyncMismatchFailure({ command, failureMessage: r.error, args, successMsg, actionLabel, options })) {
        return false;
      }
      const mergeInProgress = isMergeInProgressError(r.error);
      triggerRefresh();
      try {
        const statusAfter = await window.electronAPI.runGitCommand('statusPorcelain');
        const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
        const conflictPath = resolveConflictPathAfterGitFailure(porcelain, r.error);
        if (conflictPath) {
          workspace.setActiveTab('repo');
          setConflictResolverPath(conflictPath);
          setGitActionToast({
            msg: tr(
              mergeInProgress
                ? 'Ein laufender Merge ist noch nicht abgeschlossen. Konflikt-Resolver wird geoeffnet.'
                : 'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
              mergeInProgress
                ? 'A merge is already in progress and not finished yet. Opening the conflict resolver.'
                : 'Merge conflict: opening the conflict resolver.',
            ),
            isError: false,
          });
          triggerRefresh();
          return false;
        }
      } catch {
        // ignore; fall through to generic error toast
      }
      if (mergeInProgress) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen ausfuehren.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return false;
      }
      setGitActionToast({ msg: r.error || tr('Fehler beim AusfÃ¼hren von git.', 'Error while running git.'), isError: true });
      return false;
    } catch (e: any) {
      if (command === 'push' && isNoLocalCommitPushError(e?.message)) {
        if (options?.skipAutoInitialCommitOnPushFailure) {
          workspace.setActiveTab('repo');
          setGitActionToast({
            msg: tr(
              'Push nicht moeglich: Es gibt noch keinen lokalen Commit. Bitte zuerst committen.',
              'Push not possible: there is no local commit yet. Please commit first.',
            ),
            isError: true,
          });
          return false;
        }

        if (!options?.confirmedAutoInitialCommit) {
          const confirmationOpened = await requestInitialCommitConfirmationIfNeeded({
            commandLabel: `git ${args.join(' ')}`,
            confirmLabel: tr('Alle Aenderungen committen und pushen', 'Commit all changes and push'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, {
                ...options,
                confirmedAutoInitialCommit: true,
              });
            },
          });
          if (confirmationOpened) {
            return false;
          }
        }

        const prepared = await ensureInitialCommitForPush();
        if (!prepared) {
          return false;
        }

        const argsWithUpstream = args.some((arg) => arg === '-u' || arg === '--set-upstream')
          ? args
          : ['push', '-u', 'origin', 'HEAD'];

        return runGitCommand(
          argsWithUpstream,
          tr('Initial-Commit erstellt und gepusht.', 'Initial commit created and pushed.'),
          tr('Initial-Commit wird gepusht...', 'Pushing initial commit...'),
          {
            ...options,
            confirmedAutoInitialCommit: true,
            skipAutoInitialCommitOnPushFailure: true,
            skipAutoSetUpstreamOnPushFailure: true,
          },
        );
      }
      const missingUpstream = isMissingUpstreamPushError(e?.message);
      if (await tryAutoSetUpstreamPush(e?.message)) {
        return true;
      }
      if (missingUpstream) {
        return false;
      }
      if (await maybeRecoverRemoteSetup({ command, options, failureMessage: e?.message })) {
        return false;
      }
      if (maybeHandleSyncMismatchFailure({ command, failureMessage: e?.message, args, successMsg, actionLabel, options })) {
        return false;
      }
      const mergeInProgress = isMergeInProgressError(e?.message);
      triggerRefresh();
      try {
        const statusAfter = await window.electronAPI.runGitCommand('statusPorcelain');
        const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
        const conflictPath = resolveConflictPathAfterGitFailure(porcelain, e?.message);
        if (conflictPath) {
          workspace.setActiveTab('repo');
          setConflictResolverPath(conflictPath);
          setGitActionToast({
            msg: tr(
              mergeInProgress
                ? 'Ein laufender Merge ist noch nicht abgeschlossen. Konflikt-Resolver wird geoeffnet.'
                : 'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
              mergeInProgress
                ? 'A merge is already in progress and not finished yet. Opening the conflict resolver.'
                : 'Merge conflict: opening the conflict resolver.',
            ),
            isError: false,
          });
          triggerRefresh();
          return false;
        }
      } catch {
        // ignore
      }
      if (mergeInProgress) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen ausfuehren.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return false;
      }
      setGitActionToast({ msg: e.message, isError: true });
      return false;
    } finally {
      setIsGitActionRunning(false);
      setActiveGitCommand(null);
      setActiveGitActionLabel(null);
    }
  }, [
    ensureInitialCommitForPush,
    forceGithubRepoCreationPrompt,
    requestInitialCommitConfirmationIfNeeded,
    setConfirmDialog,
    setConflictResolverPath,
    setGitActionToast,
    settings.confirmDangerousOps,
    settings.secretScanBeforePushEnabled,
    triggerRefresh,
    workspace,
    tr,
  ]);

  runGitCommandRef.current = runGitCommand;
  isGitActionRunningRef.current = isGitActionRunning;

  return {
    activeGitActionLabel,
    activeGitCommand,
    connectError,
    createGithubRepoAndConnect,
    forceGithubRepoCreationPrompt,
    isConnectingGithubRepo,
    isGitActionRunning,
    isGitActionRunningRef,
    newRepoDescription,
    newRepoName,
    newRepoPrivate,
    runGitCommand,
    setActiveGitActionLabel,
    setConnectError,
    setNewRepoDescription,
    setNewRepoName,
    setNewRepoPrivate,
  };
};
