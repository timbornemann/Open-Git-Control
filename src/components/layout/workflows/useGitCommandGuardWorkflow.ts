import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { gitClient } from '../../../services/gitClient';
import {
  countChangedEntriesFromPorcelainV2,
  parseBranchSyncFromPorcelainV2,
} from '../../../utils/gitParsing';
import {
  GUARDED_COMMANDS,
  isForcePushCommand,
  type RunGitCommandOptions,
} from '../state/appStateShared';
import type { ConfirmDialogState } from '../layoutTypes';
import type { GitCommandRunner } from './useGitSyncRecoveryWorkflow';

type Toast = { msg: string; isError: boolean };

type Params = {
  runGitCommandRef: MutableRefObject<GitCommandRunner | null>;
  runRemoteAheadQuickFix: (params: { command: string; options?: RunGitCommandOptions }) => Promise<void>;
  settings: Pick<AppSettingsDto, 'confirmDangerousOps' | 'language' | 'secretScanBeforePushEnabled'>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
};

type GuardParams = {
  args: string[];
  command: string;
  successMsg: string;
  actionLabel?: string;
  options?: RunGitCommandOptions;
};

export const useGitCommandGuardWorkflow = ({
  runGitCommandRef,
  runRemoteAheadQuickFix,
  settings,
  setConfirmDialog,
  setGitActionToast,
}: Params) => {
  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(settings.language as AppLanguage, deText, enText);
  }, [settings.language]);

  const runWithOptions = useCallback(async (
    args: string[],
    successMsg: string,
    actionLabel: string | undefined,
    options: RunGitCommandOptions | undefined,
  ) => {
    const runner = runGitCommandRef.current;
    if (!runner) return;
    await runner(args, successMsg, actionLabel, options);
  }, [runGitCommandRef]);

  const runGitCommandGuards = useCallback(async ({
    args,
    command,
    successMsg,
    actionLabel,
    options,
  }: GuardParams): Promise<boolean> => {
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
          await runWithOptions(args, successMsg, actionLabel, {
            ...options,
            skipDirtyGuard: true,
          });
        },
      });
      return true;
    }

    if (shouldGuardRemoteAheadWithDirtyState) {
      try {
        const statusResult = await gitClient.getBranchStatusPorcelainV2();
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
              await runRemoteAheadQuickFix({ command, options });
            },
            onConfirm: async () => {
              await runWithOptions(args, successMsg, actionLabel, {
                ...options,
                skipRemoteAheadDirtyGuard: true,
              });
            },
          });
          return true;
        }
      } catch {
        // continue without blocking if preflight state checks fail
      }
    }

    if (shouldGuard) {
      try {
        const status = await gitClient.getStatusPorcelain();
        const hasLocalChanges = Boolean(status.success && String(status.data || '').trim().length > 0);
        if (hasLocalChanges) {
          setConfirmDialog({
            variant: 'danger',
            title: tr('Ungesicherte Aenderungen erkannt', 'Uncommitted changes detected'),
            message: tr(`Vor "git ${args.join(' ')}" wurden lokale Aenderungen gefunden.`, `Local changes were found before "git ${args.join(' ')}".`),
            contextItems: [
              { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
              { label: tr('Hinweis', 'Hint'), value: tr('Working Tree ist nicht sauber', 'Working tree is dirty') },
            ],
            irreversible: false,
            consequences: tr('Je nach Operation koennen unstaged oder staged Aenderungen betroffen sein.', 'Depending on the operation, unstaged or staged changes may be affected.'),
            confirmLabel: tr('Trotzdem ausfuehren', 'Run anyway'),
            onConfirm: async () => {
              await runWithOptions(args, successMsg, actionLabel, { ...options, skipDirtyGuard: true });
            },
          });
          return true;
        }
      } catch {
        // continue without blocking if status check fails
      }
    }

    if (shouldScanPushSecrets) {
      try {
        const scanTimeoutMs = 15000;
        let scanTimeoutId: number | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          scanTimeoutId = window.setTimeout(() => reject(new Error('__timeout__')), scanTimeoutMs);
        });
        let scanResult: Awaited<ReturnType<typeof gitClient.scanPushSecrets>>;
        try {
          scanResult = await Promise.race([gitClient.scanPushSecrets({ includeTags: shouldScanTagRefs }), timeoutPromise]);
        } catch (timeoutErr: any) {
          if (timeoutErr?.message === '__timeout__') {
            await gitClient.cancelSecretScan();
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
                'Ohne Secret-Scan koennten vertrauliche Daten gepusht werden.',
                'Without a secret scan, sensitive data could be pushed.',
              ),
              confirmLabel: tr('Trotzdem pushen', 'Push anyway'),
              onConfirm: async () => {
                await runWithOptions(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
              },
            });
            return true;
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
          return true;
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
              await runWithOptions(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
            },
          });
          return true;
        }
      } catch (error: any) {
        setGitActionToast({
          msg: error?.message || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
          isError: true,
        });
        return true;
      }
    }

    return false;
  }, [
    runRemoteAheadQuickFix,
    runWithOptions,
    setConfirmDialog,
    setGitActionToast,
    settings.confirmDangerousOps,
    settings.secretScanBeforePushEnabled,
    tr,
  ]);

  return { runGitCommandGuards };
};
