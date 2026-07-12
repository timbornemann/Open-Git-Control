import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { addFindingPathsToSecretScanAllowlistText } from '@/shared/secretScanAllowlist';
import { appClient } from '@/services/appClient';
import { GUARDED_COMMANDS, isForcePushCommand, type RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import {
  openDirtyWorktreeGuard,
  openForcePushGuard,
  openRemoteAheadDirtyStateGuard,
  runSecretScanGuard,
  type GitCommandGuardRequest,
  type GitCommandGuardRuntime,
} from './gitCommandGuardHandlers';
import type { GitCommandRunner } from './useGitSyncRecoveryWorkflow';

type Toast = { msg: string; isError: boolean };

type Params = {
  activeRepoRef?: MutableRefObject<string | null>;
  runGitCommandRef: MutableRefObject<GitCommandRunner | null>;
  runRemoteAheadQuickFix: (params: { command: string; options?: RunGitCommandOptions }) => Promise<void>;
  settings: Pick<AppSettingsDto, 'confirmDangerousOps' | 'language' | 'secretScanBeforePushEnabled' | 'secretScanAllowlist'>;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
};

type GuardParams = {
  args: string[];
  command: string;
  repoPath?: string | null;
  successMsg: string;
  actionLabel?: string;
  options?: RunGitCommandOptions;
};

export const useGitCommandGuardWorkflow = ({
  activeRepoRef,
  runGitCommandRef,
  runRemoteAheadQuickFix,
  settings,
  onUpdateSettings,
  setConfirmDialog,
  setGitActionToast,
}: Params) => {
  const { t, tr } = useLanguageTranslations(settings.language as AppLanguage);

  const runWithOptions = useCallback(
    async (args: string[], successMsg: string, actionLabel: string | undefined, options: RunGitCommandOptions | undefined) => {
      const runner = runGitCommandRef.current;
      if (!runner) return;
      await runner(args, successMsg, actionLabel, options);
    },
    [runGitCommandRef],
  );

  const addSecretScanFindingsToAllowlist = useCallback(
    async (findings: { filePath: string }[]) => {
      const update = addFindingPathsToSecretScanAllowlistText(settings.secretScanAllowlist, findings);
      if (update.addedPaths.length === 0) return true;
      try {
        if (!appClient.isAvailable()) throw new Error(tr('Die Einstellungen sind nicht verfuegbar.', 'Settings are unavailable.'));
        await onUpdateSettings({ secretScanAllowlist: update.allowlistText });
        const persisted = await appClient.getSettings();
        const remaining = addFindingPathsToSecretScanAllowlistText(
          persisted.secretScanAllowlist,
          update.addedPaths.map((filePath) => ({ filePath })),
        );
        if (remaining.addedPaths.length > 0) {
          throw new Error(tr('Die Secret-Scan-Allowlist wurde nicht gespeichert.', 'The secret scan allowlist was not saved.'));
        }
        return true;
      } catch (error: unknown) {
        setGitActionToast({
          msg:
            error instanceof Error ? error.message : tr('Secret-Scan-Allowlist konnte nicht gespeichert werden.', 'Could not save the secret scan allowlist.'),
          isError: true,
        });
        return false;
      }
    },
    [onUpdateSettings, setGitActionToast, settings.secretScanAllowlist, tr],
  );

  const runGitCommandGuards = useCallback(
    async ({ args, command, repoPath, successMsg, actionLabel, options }: GuardParams): Promise<boolean> => {
      const isForcePushLike = isForcePushCommand(args);
      const shouldGuard = settings.confirmDangerousOps && !options?.skipDirtyGuard && GUARDED_COMMANDS.has(command);
      const shouldGuardForcePush = settings.confirmDangerousOps && !options?.skipDirtyGuard && isForcePushLike;
      const shouldGuardRemoteAheadWithDirtyState = !options?.skipRemoteAheadDirtyGuard && (command === 'pull' || (command === 'push' && !isForcePushLike));
      const shouldSecretScan = settings.secretScanBeforePushEnabled && !options?.skipSecretScan && command === 'push';
      const request: GitCommandGuardRequest = { args, command, repoPath, successMsg, actionLabel, options };
      const runtime: GitCommandGuardRuntime = {
        isRepoCurrent: (expectedRepoPath) => !expectedRepoPath || !activeRepoRef || activeRepoRef.current === expectedRepoPath,
        runRemoteAheadQuickFix,
        runWithOptions,
        setConfirmDialog,
        setGitActionToast,
        addSecretScanFindingsToAllowlist,
        t,
        tr,
      };

      if (shouldGuardForcePush && openForcePushGuard(request, runtime)) return true;
      if (shouldGuardRemoteAheadWithDirtyState && (await openRemoteAheadDirtyStateGuard(request, runtime))) return true;
      if (shouldGuard && (await openDirtyWorktreeGuard(request, runtime))) return true;
      if (
        shouldSecretScan &&
        (await runSecretScanGuard(
          request,
          runtime,
          args.some((arg) => arg === '--tags'),
        ))
      )
        return true;
      return false;
    },
    [
      activeRepoRef,
      runRemoteAheadQuickFix,
      runWithOptions,
      setConfirmDialog,
      setGitActionToast,
      addSecretScanFindingsToAllowlist,
      settings.confirmDangerousOps,
      settings.secretScanBeforePushEnabled,
      t,
      tr,
    ],
  );

  return { runGitCommandGuards };
};
