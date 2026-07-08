import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import {
  countChangedEntriesFromPorcelainV2,
  isMergeInProgressError,
  parseBranchSyncFromPorcelainV2,
  resolveConflictPathAfterGitFailure,
} from '../../../utils/gitParsing';
import {
  isMissingUpstreamPushError,
  isNonFastForwardPushError,
  isNoLocalCommitPushError,
  isPullBlockedByLocalChangesError,
} from '../../../utils/gitPushRecovery';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '../layoutTypes';
import {
  GUARDED_COMMANDS,
  isForcePushCommand,
  type RunGitCommandOptions,
} from '../state/appStateShared';
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
    const runRemoteAheadQuickFix = async (): Promise<void> => {
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
    };
    const runAutostashPullFlow = async (
      originalArgs: string[],
      originalSuccessMsg: string,
      originalActionLabel?: string,
      originalOptions?: RunGitCommandOptions,
    ): Promise<void> => {
      const autostashOptions: RunGitCommandOptions = {
        ...originalOptions,
        skipDirtyGuard: true,
        skipRemoteAheadDirtyGuard: true,
        skipSecretScan: true,
        skipSyncMismatchRecovery: true,
      };
      const stashMessage = `Open Git Control autostash before pull: git ${originalArgs.join(' ')}`;

      const stashed = await runGitCommand(
        ['stash', 'push', '-u', '-m', stashMessage],
        tr('Autostash: Aenderungen wurden im Stash gesichert.', 'Autostash: saved local changes to stash.'),
        tr('Autostash: stash wird erstellt...', 'Autostash: creating stash...'),
        autostashOptions,
      );
      if (!stashed) {
        return;
      }

      const pulled = await runGitCommand(
        originalArgs,
        originalSuccessMsg,
        originalActionLabel,
        autostashOptions,
      );
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
    };
    const maybeHandleSyncMismatchFailure = (failureMessage: unknown): boolean => {
      if (options?.skipSyncMismatchRecovery) {
        return false;
      }

      if (command === 'push' && isNonFastForwardPushError(failureMessage)) {
        workspace.setActiveTab('repo');
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
        workspace.setActiveTab('repo');
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
            await runAutostashPullFlow(args, successMsg, actionLabel, options);
          },
        });
        return true;
      }

      return false;
    };
    const isForcePushLike = isForcePushCommand(args);
    const shouldGuard = settings.confirmDangerousOps && !options?.skipDirtyGuard && GUARDED_COMMANDS.has(command);
    const shouldGuardForcePush = settings.confirmDangerousOps && !options?.skipDirtyGuard && isForcePushLike;
    const shouldGuardRemoteAheadWithDirtyState = (
      !options?.skipRemoteAheadDirtyGuard
      && (command === 'pull' || (command === 'push' && !isForcePushLike))
    );
    const shouldScanPushSecrets =
      command === 'push'
      && settings.secretScanBeforePushEnabled
      && !options?.skipSecretScan;
    const shouldScanTagRefs = command === 'push' && args.some((arg) => arg === '--tags');

    if (await maybeHandlePushWithoutOrigin({ command, options })) {
      return false;
    }

    if (shouldGuardForcePush) {
      setConfirmDialog({
        variant: 'danger',
        title: tr('Force-Push bestaetigen', 'Confirm force push'),
        message: tr(
          'Dieser Push verwendet Force-Optionen und kann Commits auf dem Remote ueberschreiben.',
          'This push uses force options and can overwrite commits on the remote.',
        ),
        contextItems: [
          { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
          {
            label: tr('Schutz', 'Guard'),
            value: tr('confirmDangerousOps ist aktiv', 'confirmDangerousOps is enabled'),
          },
        ],
        irreversible: true,
        consequences: tr(
          'Andere Branches und lokale Aenderungen bleiben unveraendert, aber Remote-Historie kann ersetzt werden.',
          'Other branches and local changes stay unchanged, but remote history can be replaced.',
        ),
        confirmLabel: tr('Force-Push ausfuehren', 'Run force push'),
        onConfirm: async () => {
          await runGitCommand(args, successMsg, actionLabel, {
            ...options,
            skipDirtyGuard: true,
          });
        },
      });
      return false;
    }

    if (shouldGuardRemoteAheadWithDirtyState) {
      try {
        const statusResult = await window.electronAPI.runGitCommand('status', '--porcelain=v2', '--branch');
        const statusText = statusResult.success ? String(statusResult.data || '') : '';
        const remoteSyncState = parseBranchSyncFromPorcelainV2(statusText);
        const behindCount = remoteSyncState.behind;
        const hasUpstream = remoteSyncState.hasUpstream;

        const changedFiles = countChangedEntriesFromPorcelainV2(statusText);
        const hasLocalChanges = changedFiles > 0;

        if (hasLocalChanges && hasUpstream && behindCount > 0) {
          const isPushGuard = command === 'push';
          setConfirmDialog({
            variant: 'danger',
            title: tr(
              isPushGuard ? 'Push jetzt wahrscheinlich blockiert' : 'Pull in diesem Zustand riskant',
              isPushGuard ? 'Push is likely blocked in this state' : 'Pull is risky in this state',
            ),
            message: tr(
              isPushGuard
                ? `Remote ist ${behindCount} Commit${behindCount === 1 ? '' : 's'} voraus und es gibt lokale uncommitted Aenderungen. Ein normaler Push wird so oft mit "non-fast-forward" abgelehnt.`
                : `Remote ist ${behindCount} Commit${behindCount === 1 ? '' : 's'} voraus und es gibt lokale uncommitted Aenderungen. Pull kann so fehlschlagen oder Konflikte erzeugen.`,
              isPushGuard
                ? `Remote is ahead by ${behindCount} commit${behindCount === 1 ? '' : 's'} and local changes are still uncommitted. A regular push is often rejected with a non-fast-forward error.`
                : `Remote is ahead by ${behindCount} commit${behindCount === 1 ? '' : 's'} and local changes are still uncommitted. Pull may fail or create conflicts in this state.`,
            ),
            contextItems: [
              { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
              { label: tr('Remote voraus', 'Remote ahead'), value: String(behindCount) },
              {
                label: tr('Lokale Aenderungen', 'Local changes'),
                value: tr(
                  `${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} uncommitted`,
                  `${changedFiles} file${changedFiles === 1 ? '' : 's'} uncommitted`,
                ),
              },
            ],
            irreversible: false,
            consequences: tr(
              'Empfohlen: zuerst committen oder stashen, dann pull (ggf. --rebase), danach push.',
              'Recommended: commit or stash first, then pull (optionally --rebase), then push.',
            ),
            confirmLabel: tr(
              isPushGuard ? 'Trotzdem pushen' : 'Trotzdem pullen',
              isPushGuard ? 'Push anyway' : 'Pull anyway',
            ),
            secondaryActionLabel: tr('Quick-Fix ausfuehren', 'Run quick fix'),
            secondaryActionVariant: 'default',
            onSecondaryAction: async () => {
              await runRemoteAheadQuickFix();
            },
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, {
                ...options,
                skipRemoteAheadDirtyGuard: true,
              });
            },
          });
          return false;
        }
      } catch {
        // continue without blocking if preflight state checks fail
      }
    }

    if (shouldGuard) {
      try {
        const status = await window.electronAPI.runGitCommand('statusPorcelain');
        const hasLocalChanges = Boolean(status.success && String(status.data || '').trim().length > 0);
        if (hasLocalChanges) {
          setConfirmDialog({
            variant: 'danger',
            title: tr('Ungesicherte Ã„nderungen erkannt', 'Uncommitted changes detected'),
            message: tr(`Vor "git ${args.join(' ')}" wurden lokale Ã„nderungen gefunden.`, `Local changes were found before "git ${args.join(' ')}".`),
            contextItems: [
              { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
              { label: tr('Hinweis', 'Hint'), value: tr('Working Tree ist nicht sauber', 'Working tree is dirty') },
            ],
            irreversible: false,
            consequences: tr('Je nach Operation kÃ¶nnen unstaged oder staged Ã„nderungen betroffen sein.', 'Depending on the operation, unstaged or staged changes may be affected.'),
            confirmLabel: tr('Trotzdem ausfÃ¼hren', 'Run anyway'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, { ...options, skipDirtyGuard: true });
            },
          });
          return false;
        }
      } catch {
        // continue without blocking if status check fails
      }
    }

    if (shouldScanPushSecrets) {
      try {
        const SCAN_TIMEOUT_MS = 15000;
        let scanTimeoutId: number | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          scanTimeoutId = window.setTimeout(() => reject(new Error('__timeout__')), SCAN_TIMEOUT_MS);
        });
        let scanResult: Awaited<ReturnType<typeof window.electronAPI.scanPushSecrets>>;
        try {
          scanResult = await Promise.race([window.electronAPI.scanPushSecrets({ includeTags: shouldScanTagRefs }), timeoutPromise]);
        } catch (timeoutErr: any) {
          if (timeoutErr?.message === '__timeout__') {
            await window.electronAPI.cancelSecretScan();
            setConfirmDialog({
              variant: 'danger',
              title: tr('Secret-Scan Timeout', 'Secret scan timed out'),
              message: tr(
                'Der Secret-Scan hat zu lange gedauert (>15s) und wurde abgebrochen. Trotzdem pushen?',
                'The secret scan took too long (>15s) and was cancelled. Push anyway?',
              ),
              contextItems: [],
              irreversible: false,
              consequences: tr(
                'Ohne Secret-Scan kÃ¶nnten vertrauliche Daten gepusht werden.',
                'Without a secret scan, sensitive data could be pushed.',
              ),
              confirmLabel: tr('Trotzdem pushen', 'Push anyway'),
              onConfirm: async () => {
                await runGitCommand(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
              },
            });
            return false;
          }
          throw timeoutErr;
        } finally {
          if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId);
        }
        if (!scanResult.success) {
          setGitActionToast({
            msg: scanResult.error || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
            isError: true,
          });
          return false;
        }

        const findings = scanResult.data.findings || [];
        if (findings.length > 0) {
          const contextItems = findings.slice(0, 8).map((finding, index) => ({
            label: tr(`Treffer ${index + 1}`, `Finding ${index + 1}`),
            value: `${finding.filePath}:${finding.lineNumber}  ${finding.contextLine}`,
          }));

          setConfirmDialog({
            variant: 'danger',
            title: tr('Moegliche Secrets vor Push erkannt', 'Potential secrets detected before push'),
            message: tr(
              `${findings.length} moegliche Secret-Treffer wurden in den zu veroeffentlichenden Aenderungen gefunden.`,
              `${findings.length} potential secret hit(s) were found in changes that would be published.`,
            ),
            contextItems,
            irreversible: true,
            consequences: tr(
              'Bitte pruefe die Treffer. Ein Push kann vertrauliche Werte unwiderruflich veroeffentlichen.',
              'Please review these findings. Pushing can irreversibly publish sensitive values.',
            ),
            confirmLabel: tr('Trotzdem pushen', 'Push anyway'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
            },
          });
          return false;
        }
      } catch (error: any) {
        setGitActionToast({
          msg: error?.message || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
          isError: true,
        });
        return false;
      }
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
      if (maybeHandleSyncMismatchFailure(r.error)) {
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
      if (maybeHandleSyncMismatchFailure(e?.message)) {
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
