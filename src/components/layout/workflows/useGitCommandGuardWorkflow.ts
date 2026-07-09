import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/global';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
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

export const useGitCommandGuardWorkflow = ({ runGitCommandRef, runRemoteAheadQuickFix, settings, setConfirmDialog, setGitActionToast }: Params) => {
  const { t, tr } = useLanguageTranslations(settings.language as AppLanguage);

  const runWithOptions = useCallback(
    async (args: string[], successMsg: string, actionLabel: string | undefined, options: RunGitCommandOptions | undefined) => {
      const runner = runGitCommandRef.current;
      if (!runner) return;
      await runner(args, successMsg, actionLabel, options);
    },
    [runGitCommandRef],
  );

  const runGitCommandGuards = useCallback(
    async ({ args, command, successMsg, actionLabel, options }: GuardParams): Promise<boolean> => {
      const isForcePushLike = isForcePushCommand(args);
      const shouldGuard = settings.confirmDangerousOps && !options?.skipDirtyGuard && GUARDED_COMMANDS.has(command);
      const shouldGuardForcePush = settings.confirmDangerousOps && !options?.skipDirtyGuard && isForcePushLike;
      const shouldGuardRemoteAheadWithDirtyState = !options?.skipRemoteAheadDirtyGuard && (command === 'pull' || (command === 'push' && !isForcePushLike));
      const shouldScanPushSecrets = command === 'push' && settings.secretScanBeforePushEnabled && !options?.skipSecretScan;
      const shouldScanTagRefs = command === 'push' && args.some((arg) => arg === '--tags');
      const request: GitCommandGuardRequest = { args, command, successMsg, actionLabel, options };
      const runtime: GitCommandGuardRuntime = {
        runRemoteAheadQuickFix,
        runWithOptions,
        setConfirmDialog,
        setGitActionToast,
        t,
        tr,
      };

      if (shouldGuardForcePush && openForcePushGuard(request, runtime)) return true;
      if (shouldGuardRemoteAheadWithDirtyState && (await openRemoteAheadDirtyStateGuard(request, runtime))) return true;
      if (shouldGuard && (await openDirtyWorktreeGuard(request, runtime))) return true;
      if (shouldScanPushSecrets && (await runSecretScanGuard(request, runtime, shouldScanTagRefs))) return true;

      return false;
    },
    [runRemoteAheadQuickFix, runWithOptions, setConfirmDialog, setGitActionToast, settings.confirmDangerousOps, settings.secretScanBeforePushEnabled, t, tr],
  );

  return { runGitCommandGuards };
};
