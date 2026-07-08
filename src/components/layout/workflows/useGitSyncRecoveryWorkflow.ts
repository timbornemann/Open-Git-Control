import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import {
  isNonFastForwardPushError,
  isPullBlockedByLocalChangesError,
} from '../../../utils/gitPushRecovery';
import type { RunGitCommandOptions } from '../state/appStateShared';
import type { ConfirmDialogState } from '../layoutTypes';
import type { AppTabId } from '../sidebar/AppSidebar.types';

type Toast = { msg: string; isError: boolean };

export type GitCommandRunner = (
  args: string[],
  successMsg: string,
  actionLabel?: string,
  options?: RunGitCommandOptions,
) => Promise<boolean>;

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

export const useGitSyncRecoveryWorkflow = ({
  runGitCommandRef,
  setActiveTab,
  setConfirmDialog,
  setGitActionToast,
  language,
}: Params) => {
  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(language, deText, enText);
  }, [language]);

  const runRemoteAheadQuickFix = useCallback(async ({
    command,
    options,
  }: RemoteAheadQuickFixParams): Promise<void> => {
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
      tr('Quick-Fix: Aenderungen wurden im Stash gesichert.', 'Quick fix: saved changes to stash.'),
      tr('Quick-Fix: stash wird erstellt...', 'Quick fix: creating stash...'),
      quickFixOptions,
    );
    if (!stashed) {
      return;
    }

    const pulled = await runGitCommand(
      ['pull', '--rebase'],
      tr('Quick-Fix: pull --rebase abgeschlossen.', 'Quick fix: pull --rebase completed.'),
      tr('Quick-Fix: pull --rebase wird ausgefuehrt...', 'Quick fix: running pull --rebase...'),
      quickFixOptions,
    );
    if (!pulled) {
      setGitActionToast({
        msg: tr(
          'Quick-Fix gestoppt: Pull/Rebase ist fehlgeschlagen. Deine Aenderungen bleiben im neuesten Stash gesichert.',
          'Quick fix stopped: pull/rebase failed. Your changes remain safe in the latest stash.',
        ),
        isError: true,
      });
      return;
    }

    const popped = await runGitCommand(
      ['stash', 'pop'],
      tr('Quick-Fix: Stash wurde wieder angewendet.', 'Quick fix: stash reapplied.'),
      tr('Quick-Fix: Stash wird wieder angewendet...', 'Quick fix: reapplying stash...'),
      quickFixOptions,
    );
    if (!popped) {
      setGitActionToast({
        msg: tr(
          'Quick-Fix fast fertig: Pull/Rebase war erfolgreich, aber Stash-Pop braucht manuelle Aufloesung.',
          'Quick fix nearly finished: pull/rebase succeeded, but stash pop needs manual resolution.',
        ),
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
  }, [runGitCommandRef, setGitActionToast, tr]);

  const runAutostashPullFlow = useCallback(async ({
    args,
    successMsg,
    actionLabel,
    options,
  }: AutostashPullFlowParams): Promise<void> => {
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
      tr('Autostash: Aenderungen wurden im Stash gesichert.', 'Autostash: saved local changes to stash.'),
      tr('Autostash: stash wird erstellt...', 'Autostash: creating stash...'),
      autostashOptions,
    );
    if (!stashed) {
      return;
    }

    const pulled = await runGitCommand(args, successMsg, actionLabel, autostashOptions);
    if (!pulled) {
      setGitActionToast({
        msg: tr(
          'Autostash gestoppt: Pull ist fehlgeschlagen. Deine Aenderungen bleiben im neuesten Stash gesichert.',
          'Autostash stopped: pull failed. Your changes remain safe in the latest stash.',
        ),
        isError: true,
      });
      return;
    }

    const popped = await runGitCommand(
      ['stash', 'pop'],
      tr('Autostash: Stash wurde wieder angewendet.', 'Autostash: stash reapplied.'),
      tr('Autostash: Stash wird wieder angewendet...', 'Autostash: reapplying stash...'),
      autostashOptions,
    );
    if (!popped) {
      setGitActionToast({
        msg: tr(
          'Autostash fast fertig: Pull war erfolgreich, aber Stash-Pop braucht manuelle Aufloesung.',
          'Autostash nearly finished: pull succeeded, but stash pop needs manual resolution.',
        ),
        isError: true,
      });
      return;
    }

    setGitActionToast({
      msg: tr(
        'Autostash-Pull erfolgreich abgeschlossen (stash -> pull -> stash pop).',
        'Autostash pull completed successfully (stash -> pull -> stash pop).',
      ),
      isError: false,
    });
  }, [runGitCommandRef, setGitActionToast, tr]);

  const maybeHandleSyncMismatchFailure = useCallback(({
    command,
    failureMessage,
    args,
    successMsg,
    actionLabel,
    options,
  }: SyncMismatchFailureParams): boolean => {
    if (options?.skipSyncMismatchRecovery) {
      return false;
    }

    if (command === 'push' && isNonFastForwardPushError(failureMessage)) {
      setActiveTab('repo');
      setGitActionToast({
        msg: tr(
          'Push abgelehnt: Remote ist neuer als lokal. Bitte zuerst committen/stashen, dann pull (oder pull --rebase) und danach erneut pushen.',
          'Push rejected: remote is newer than local. Commit or stash first, then pull (or pull --rebase), and push again.',
        ),
        isError: true,
      });
      return true;
    }

    if (command === 'pull' && isPullBlockedByLocalChangesError(failureMessage)) {
      setActiveTab('repo');
      setConfirmDialog({
        variant: 'danger',
        title: tr('Pull durch uncommitted Aenderungen blockiert', 'Pull blocked by uncommitted changes'),
        message: tr(
          'Der Pull wurde abgebrochen, da uncommitted Aenderungen ueberschrieben werden koennten. Moechtest du ein Autostash ausfuehren (lokale uncommitted Aenderungen stashen, pullen und Stash wieder anwenden)?',
          'The pull was aborted because uncommitted changes would be overwritten. Do you want to perform an autostash (stash changes, pull, and reapply stash)?',
        ),
        contextItems: [
          { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
          {
            label: tr('Hinweis', 'Hint'),
            value: tr(
              'Deine lokalen uncommitted Aenderungen werden voruebergehend gesichert.',
              'Your local uncommitted changes will be stashed temporarily.',
            ),
          },
        ],
        irreversible: false,
        consequences: tr(
          'Falls beim Wiederanwenden des Stashs Konflikte entstehen, wird der Konflikt-Resolver geoeffnet.',
          'If conflicts occur when reapplying the stash, the conflict resolver will open.',
        ),
        confirmLabel: tr('Mit Autostash ausfuehren', 'Run with autostash'),
        onConfirm: async () => {
          await runAutostashPullFlow({ args, successMsg, actionLabel, options });
        },
      });
      return true;
    }

    return false;
  }, [runAutostashPullFlow, setActiveTab, setConfirmDialog, setGitActionToast, tr]);

  return {
    maybeHandleSyncMismatchFailure,
    runAutostashPullFlow,
    runRemoteAheadQuickFix,
  };
};
