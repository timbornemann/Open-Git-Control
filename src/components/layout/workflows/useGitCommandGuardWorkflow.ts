import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/global';
import { translateFromCatalog, trByLanguage, type AppLanguage, type TranslationVariables } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { countChangedEntriesFromPorcelainV2, parseBranchSyncFromPorcelainV2 } from '@/utils/gitParsing';
import { GUARDED_COMMANDS, isForcePushCommand, type RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
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
  const tr = useCallback(
    (deText: string, enText: string) => {
      return trByLanguage(settings.language as AppLanguage, deText, enText);
    },
    [settings.language],
  );
  const t = useCallback(
    (key: string, variables?: TranslationVariables) => translateFromCatalog(settings.language as AppLanguage, key, variables),
    [settings.language],
  );

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

      if (shouldGuardForcePush) {
        setConfirmDialog({
          variant: 'danger',
          title: t('generated.components.layout.workflows.usegitcommandguardworkflow.confirm_force_push_dd412d80'),
          message: t('generated.components.layout.workflows.usegitcommandguardworkflow.this_push_uses_force_options_and_can_overwrite_commits_o_86651249'),
          contextItems: [
            { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git ${args.join(' ')}` },
            {
              label: t('generated.components.layout.workflows.usegitcommandguardworkflow.guard_85f78727'),
              value: t('generated.components.layout.workflows.usegitcommandguardworkflow.confirmdangerousops_is_enabled_75a70e35'),
            },
          ],
          irreversible: true,
          consequences: t('generated.components.layout.workflows.usegitcommandguardworkflow.other_branches_and_local_changes_stay_unchanged_but_remo_06759649'),
          confirmLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.run_force_push_5ddf4b4d'),
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
                { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git ${args.join(' ')}` },
                { label: t('generated.components.layout.workflows.usegitcommandguardworkflow.remote_ahead_040a92ca'), value: String(behindCount) },
                {
                  label: t('generated.components.layout.workflows.usegitcommandguardworkflow.local_changes_fc4435ff'),
                  value: tr(
                    `${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} uncommitted`,
                    `${changedFiles} file${changedFiles === 1 ? '' : 's'} uncommitted`,
                  ),
                },
              ],
              irreversible: false,
              consequences: t(
                'generated.components.layout.workflows.usegitcommandguardworkflow.recommended_commit_or_stash_first_then_pull_optionally_r_53cb75a1',
              ),
              confirmLabel: tr(isPushGuard ? 'Trotzdem pushen' : 'Trotzdem pullen', isPushGuard ? 'Push anyway' : 'Pull anyway'),
              secondaryActionLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.run_quick_fix_3c2a62d8'),
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
              title: t('generated.components.layout.workflows.usegitcommandguardworkflow.uncommitted_changes_detected_833713ea'),
              message: tr(`Vor "git ${args.join(' ')}" wurden lokale Aenderungen gefunden.`, `Local changes were found before "git ${args.join(' ')}".`),
              contextItems: [
                { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git ${args.join(' ')}` },
                {
                  label: t('generated.components.layout.workflows.usegitcommandguardworkflow.hint_5628c320'),
                  value: t('generated.components.layout.workflows.usegitcommandguardworkflow.working_tree_is_dirty_72dcc487'),
                },
              ],
              irreversible: false,
              consequences: t(
                'generated.components.layout.workflows.usegitcommandguardworkflow.depending_on_the_operation_unstaged_or_staged_changes_ma_9d5cf90f',
              ),
              confirmLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.run_anyway_bc5dff81'),
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
                title: t('generated.components.layout.workflows.usegitcommandguardworkflow.secret_scan_timed_out_307b8b8c'),
                message: t(
                  'generated.components.layout.workflows.usegitcommandguardworkflow.the_secret_scan_took_too_long_15s_and_was_cancelled_push_a1137d02',
                ),
                contextItems: [],
                irreversible: false,
                consequences: t(
                  'generated.components.layout.workflows.usegitcommandguardworkflow.without_a_secret_scan_sensitive_data_could_be_pushed_eda26acb',
                ),
                confirmLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.push_anyway_46f5aba1'),
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
              msg: scanResult.error || t('generated.components.layout.workflows.usegitcommandguardworkflow.secret_scan_before_push_failed_a33eb357'),
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
              title: t('generated.components.layout.workflows.usegitcommandguardworkflow.potential_secrets_detected_before_push_deeb3751'),
              message: tr(
                `${findings.length} moegliche Secret-Treffer wurden in den zu veroeffentlichenden Aenderungen gefunden.`,
                `${findings.length} potential secret hit(s) were found in changes that would be published.`,
              ),
              contextItems,
              irreversible: true,
              consequences: t(
                'generated.components.layout.workflows.usegitcommandguardworkflow.please_review_these_findings_pushing_can_irreversibly_pu_fb7def03',
              ),
              confirmLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.push_anyway_46f5aba1'),
              onConfirm: async () => {
                await runWithOptions(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
              },
            });
            return true;
          }
        } catch (error: any) {
          setGitActionToast({
            msg: error?.message || t('generated.components.layout.workflows.usegitcommandguardworkflow.secret_scan_before_push_failed_a33eb357'),
            isError: true,
          });
          return true;
        }
      }

      return false;
    },
    [runRemoteAheadQuickFix, runWithOptions, setConfirmDialog, setGitActionToast, settings.confirmDangerousOps, settings.secretScanBeforePushEnabled, tr],
  );

  return { runGitCommandGuards };
};
