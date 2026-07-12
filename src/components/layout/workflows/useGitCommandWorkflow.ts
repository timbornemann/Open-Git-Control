import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import type { GitCommandNameDto } from '@/types/gitDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { appClient } from '@/services/appClient';
import { isMergeInProgressError, isCherryPickInProgressError, resolveConflictPathAfterGitFailure } from '@/utils/gitParsing';
import { isMissingUpstreamPushError, isNoLocalCommitPushError } from '@/utils/gitPushRecovery';
import { parseGitHubPushProtectionFailure } from '@/utils/githubPushProtection';
import type { AppTabId } from '@/app/state/contracts';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { type RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import { gitWorkflowCommands } from './gitWorkflowCommands';
import { useGitCommandGuardWorkflow } from './useGitCommandGuardWorkflow';
import { useGitSyncRecoveryWorkflow, type GitCommandRunner } from './useGitSyncRecoveryWorkflow';
import { useRemoteRecoveryWorkflow } from './useRemoteRecoveryWorkflow';

type Toast = { msg: string; isError: boolean };

type WorkspaceBridge = {
  activeRepo: string | null;
  addOpenRepo: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: AppTabId) => void;
};

type Params = {
  workspace: WorkspaceBridge;
  settings: Pick<AppSettingsDto, 'confirmDangerousOps' | 'defaultBranch' | 'language' | 'secretScanBeforePushEnabled' | 'secretScanAllowlist'>;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  triggerRefresh: () => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  setConflictResolverPath: (path: string) => void;
};

export const useGitCommandWorkflow = ({
  workspace,
  settings,
  onUpdateSettings,
  triggerRefresh,
  setConfirmDialog,
  setGitActionToast,
  setConflictResolverPath,
}: Params) => {
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const [activeGitCommand, setActiveGitCommand] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);
  const activeGitWorkflowRunRef = useRef<number | null>(null);
  const nextGitWorkflowRunIdRef = useRef(0);
  const runGitCommandRef = useRef<GitCommandRunner | null>(null);
  const activeRepoRef = useRef<string | null>(workspace.activeRepo);

  useLayoutEffect(() => {
    activeRepoRef.current = workspace.activeRepo;
    activeGitWorkflowRunRef.current = null;
    isGitActionRunningRef.current = false;
    setIsGitActionRunning(false);
    setActiveGitCommand(null);
    setActiveGitActionLabel(null);
  }, [workspace.activeRepo]);

  const { t, tr } = useLanguageTranslations(settings.language as AppLanguage);

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

  const { maybeHandleSyncMismatchFailure, runRemoteAheadQuickFix } = useGitSyncRecoveryWorkflow({
    runGitCommandRef,
    setActiveTab: workspace.setActiveTab,
    setConfirmDialog,
    setGitActionToast,
    language: settings.language,
  });

  const { runGitCommandGuards } = useGitCommandGuardWorkflow({
    activeRepoRef,
    runGitCommandRef,
    runRemoteAheadQuickFix,
    settings,
    onUpdateSettings,
    setConfirmDialog,
    setGitActionToast,
  });

  const runGitCommand = useCallback(
    async (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions, internalContinuation = false): Promise<boolean> => {
      if (!gitClient.isAvailable() || !workspace.activeRepo || args.length === 0) return false;
      if (options?.expectedRepoPath && workspace.activeRepo !== options.expectedRepoPath) return false;
      if (!internalContinuation && (activeGitWorkflowRunRef.current !== null || isGitActionRunningRef.current)) return false;
      const repoAtStart = options?.expectedRepoPath || workspace.activeRepo;
      options = { ...options, expectedRepoPath: repoAtStart };
      const workflowRunId = ++nextGitWorkflowRunIdRef.current;
      activeGitWorkflowRunRef.current = workflowRunId;
      isGitActionRunningRef.current = true;
      const isStillActiveRepo = () => activeRepoRef.current === repoAtStart;
      const releaseWorkflowRun = () => {
        if (activeGitWorkflowRunRef.current !== workflowRunId) return;
        activeGitWorkflowRunRef.current = null;
        isGitActionRunningRef.current = false;
        if (isStillActiveRepo()) {
          setIsGitActionRunning(false);
          setActiveGitCommand(null);
          setActiveGitActionLabel(null);
        }
      };

      const command = args[0] as GitCommandNameDto;
      const tryAutoSetUpstreamPush = async (failureMessage: unknown): Promise<boolean> => {
        if (command !== 'push' || options?.skipAutoSetUpstreamOnPushFailure || !isMissingUpstreamPushError(failureMessage)) {
          return false;
        }

        const fallbackArgs = gitClient.buildPushCurrentBranchArgs({
          extraArgs: args.slice(1),
          remote: 'origin',
          ref: 'HEAD',
          setUpstream: true,
        });
        const fallbackSuccess = await runGitCommand(
          fallbackArgs,
          t('generated.components.layout.workflows.usegitcommandworkflow.pushed_branch_and_set_upstream_486b4c06'),
          t('generated.components.layout.workflows.usegitcommandworkflow.running_push_with_upstream_c4d07a1f'),
          { ...options, skipAutoSetUpstreamOnPushFailure: true },
          true,
        );
        if (!isStillActiveRepo()) return false;
        return fallbackSuccess;
      };

      // This central recovery path deliberately routes every known Git failure.
      // eslint-disable-next-line complexity
      const recoverFromGitCommandFailure = async (failureMessage: unknown, fallbackErrorMessage?: string): Promise<boolean> => {
        const errorMessage =
          typeof failureMessage === 'string' && failureMessage.trim()
            ? failureMessage
            : fallbackErrorMessage || t('generated.components.layout.workflows.usegitcommandworkflow.error_while_running_git_69219c3a');

        if (command === 'push' && isNoLocalCommitPushError(errorMessage)) {
          if (options?.skipAutoInitialCommitOnPushFailure) {
            workspace.setActiveTab('repo');
            setGitActionToast({
              msg: t('generated.components.layout.workflows.usegitcommandworkflow.push_not_possible_there_is_no_local_commit_yet_please_co_7a8286f0'),
              isError: true,
            });
            return false;
          }

          if (!options?.confirmedAutoInitialCommit) {
            const confirmationOpened = await requestInitialCommitConfirmationIfNeeded({
              commandLabel: `git ${args.join(' ')}`,
              repoPath: repoAtStart,
              confirmLabel: t('generated.components.layout.workflows.usegitcommandworkflow.commit_all_changes_and_push_72c5fb04'),
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

          if (!isStillActiveRepo()) return false;
          const prepared = await ensureInitialCommitForPush({ expectedRepoPath: repoAtStart });
          if (!isStillActiveRepo()) return false;
          if (!prepared) {
            return false;
          }

          const argsWithUpstream = args.some((arg) => arg === '-u' || arg === '--set-upstream')
            ? args
            : gitWorkflowCommands.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });

          return runGitCommand(
            argsWithUpstream,
            t('generated.components.layout.workflows.usegitcommandworkflow.initial_commit_created_and_pushed_295fbe68'),
            t('generated.components.layout.workflows.usegitcommandworkflow.pushing_initial_commit_6b4afbb5'),
            {
              ...options,
              confirmedAutoInitialCommit: true,
              skipAutoInitialCommitOnPushFailure: true,
              skipAutoSetUpstreamOnPushFailure: true,
            },
            true,
          );
        }

        if (command === 'push') {
          const pushProtection = parseGitHubPushProtectionFailure(errorMessage);
          if (pushProtection) {
            const violation = pushProtection.violations[0];
            const unblockUrl = violation?.unblockUrl;
            const helpUrl = pushProtection.documentationUrl || pushProtection.securitySettingsUrl;
            const openUrl = async (url: string, fallbackMessage: string) => {
              try {
                if (!appClient.isAvailable()) throw new Error();
                await appClient.openExternalUrl(url);
              } catch {
                setGitActionToast({ msg: fallbackMessage, isError: true });
              }
            };
            setConfirmDialog({
              variant: 'danger',
              title: tr('GitHub hat den Push wegen eines Secrets blockiert', 'GitHub blocked this push because of a secret'),
              message: tr(
                'GitHub Push Protection hat ein moegliches Secret in der Push-Historie erkannt. Entferne ein echtes Secret aus dem Commit und pushe danach erneut. Nutze das Freigeben nur fuer Testdaten oder einen bestaetigten Fehlalarm.',
                'GitHub Push Protection found a potential secret in the commits being pushed. Remove a real secret from the commit history and push again. Only unblock a confirmed test value or false positive.',
              ),
              contextItems: [
                ...(violation?.secretType ? [{ label: tr('Erkanntes Secret', 'Detected secret'), value: violation.secretType }] : []),
                ...(violation?.filePath
                  ? [{ label: tr('Fundstelle', 'Location'), value: `${violation.filePath}${violation.lineNumber ? `:${violation.lineNumber}` : ''}` }]
                  : []),
                ...(violation?.commitHash ? [{ label: tr('Commit', 'Commit'), value: violation.commitHash }] : []),
                ...(pushProtection.violations.length > 1
                  ? [{ label: tr('Weitere Treffer', 'Additional findings'), value: String(pushProtection.violations.length - 1) }]
                  : []),
              ],
              irreversible: false,
              consequences: tr(
                'Der Push wurde nicht ausgefuehrt. Deine lokalen Commits bleiben unveraendert.',
                'The push was not performed. Your local commits remain unchanged.',
              ),
              confirmLabel: unblockUrl ? tr('GitHub-Freigabe oeffnen', 'Open GitHub unblock page') : tr('Schliessen', 'Close'),
              secondaryActionLabel: helpUrl ? tr('GitHub-Hilfe oeffnen', 'Open GitHub help') : undefined,
              secondaryActionVariant: 'default',
              onConfirm: async () => {
                if (!unblockUrl) return;
                await openUrl(unblockUrl, tr('Die GitHub-Freigabeseite konnte nicht geoeffnet werden.', 'Could not open the GitHub unblock page.'));
              },
              onSecondaryAction: helpUrl
                ? async () => {
                    await openUrl(helpUrl, tr('Die GitHub-Hilfe konnte nicht geoeffnet werden.', 'Could not open GitHub help.'));
                  }
                : undefined,
            });
            return false;
          }
        }

        const missingUpstream = isMissingUpstreamPushError(errorMessage);
        if (await tryAutoSetUpstreamPush(errorMessage)) {
          return true;
        }
        if (!isStillActiveRepo()) return false;
        if (missingUpstream) {
          setGitActionToast({
            msg: tr(
              'Push fehlgeschlagen: Upstream konnte nicht automatisch gesetzt werden. Bitte Upstream manuell setzen und erneut pushen.',
              'Push failed: could not set upstream automatically. Please set upstream manually and push again.',
            ),
            isError: true,
          });
          return false;
        }
        if (await maybeRecoverRemoteSetup({ command, options, failureMessage: errorMessage })) {
          return false;
        }
        if (!isStillActiveRepo()) return false;
        if (maybeHandleSyncMismatchFailure({ command, failureMessage: errorMessage, args, successMsg, actionLabel, options })) {
          return false;
        }

        const mergeInProgress = isMergeInProgressError(errorMessage);
        const cherryPickInProgress = isCherryPickInProgressError(errorMessage);
        if (!isStillActiveRepo()) return false;
        triggerRefresh();
        try {
          const statusAfter = await gitClient.runGitCommandForRepo(repoAtStart, 'statusPorcelain');
          if (!isStillActiveRepo()) return false;
          const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
          const conflictPath = resolveConflictPathAfterGitFailure(porcelain, errorMessage);
          if (conflictPath) {
            workspace.setActiveTab('repo');
            setConflictResolverPath(conflictPath);
            setGitActionToast({
              msg: tr(
                mergeInProgress
                  ? 'Ein laufender Merge ist noch nicht abgeschlossen. Konflikt-Resolver wird geoeffnet.'
                  : cherryPickInProgress
                    ? 'Ein laufender Cherry-Pick ist noch nicht abgeschlossen. Konflikt-Resolver wird geoeffnet.'
                    : 'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
                mergeInProgress
                  ? 'A merge is already in progress and not finished yet. Opening the conflict resolver.'
                  : cherryPickInProgress
                    ? 'A cherry-pick is already in progress and not finished yet. Opening the conflict resolver.'
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
            msg: t('generated.components.layout.workflows.usegitcommandworkflow.a_merge_is_already_active_merge_head_please_continue_or_65bed253'),
            isError: true,
          });
          return false;
        }

        if (cherryPickInProgress) {
          workspace.setActiveTab('repo');
          setGitActionToast({
            msg: tr(
              'Ein Cherry-Pick ist noch aktiv (CHERRY_PICK_HEAD). Bitte fortsetzen oder abbrechen.',
              'A cherry-pick is still active (CHERRY_PICK_HEAD). Please continue or abort.',
            ),
            isError: true,
          });
          return false;
        }

        setGitActionToast({ msg: errorMessage, isError: true });
        return false;
      };

      try {
        if (await maybeHandlePushWithoutOrigin({ command, options })) {
          releaseWorkflowRun();
          return false;
        }
        if (!isStillActiveRepo()) {
          releaseWorkflowRun();
          return false;
        }

        if (await runGitCommandGuards({ args, command, repoPath: repoAtStart, successMsg, actionLabel, options })) {
          releaseWorkflowRun();
          return false;
        }
        if (!isStillActiveRepo()) {
          releaseWorkflowRun();
          return false;
        }
      } catch (error: any) {
        if (isStillActiveRepo()) {
          setGitActionToast({
            msg: error?.message || t('generated.components.layout.workflows.usegitcommandworkflow.error_while_running_git_69219c3a'),
            isError: true,
          });
        }
        releaseWorkflowRun();
        return false;
      }
      setIsGitActionRunning(true);
      setActiveGitCommand(command);
      setActiveGitActionLabel(actionLabel || tr(`Git ${command} wird ausgeführt...`, `Running git ${command}...`));

      try {
        const r = await gitClient.runGitCommandForRepo(repoAtStart, command, ...args.slice(1));
        if (!isStillActiveRepo()) return false;
        if (r.success) {
          if (forceGithubRepoCreationPrompt && (command === 'push' || command === 'pull' || command === 'fetch')) {
            setForceGithubRepoCreationPrompt(false);
            setConnectError(null);
          }
          setGitActionToast({ msg: successMsg, isError: false });
          triggerRefresh();
          return true;
        }
        return recoverFromGitCommandFailure(r.error, t('generated.components.layout.workflows.usegitcommandworkflow.error_while_running_git_69219c3a'));
      } catch (e: any) {
        if (!isStillActiveRepo()) return false;
        return recoverFromGitCommandFailure(
          e?.message,
          e?.message || t('generated.components.layout.workflows.usegitcommandworkflow.error_while_running_git_69219c3a'),
        );
      } finally {
        // Always clear the run lock (refs + UI state). Previously only React state was
        // reset here, which left isGitActionRunningRef/activeGitWorkflowRunRef stuck and
        // silently blocked every subsequent non-continuation runGitCommand call.
        releaseWorkflowRun();
      }
    },
    [
      ensureInitialCommitForPush,
      forceGithubRepoCreationPrompt,
      maybeHandlePushWithoutOrigin,
      maybeHandleSyncMismatchFailure,
      maybeRecoverRemoteSetup,
      requestInitialCommitConfirmationIfNeeded,
      runGitCommandGuards,
      setConnectError,
      setConfirmDialog,
      setConflictResolverPath,
      setForceGithubRepoCreationPrompt,
      setGitActionToast,
      t,
      triggerRefresh,
      tr,
      workspace,
    ],
  );

  runGitCommandRef.current = runGitCommand;

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
