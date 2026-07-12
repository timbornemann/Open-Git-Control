import { gitClient } from '@/services/gitClient';
import { countChangedEntriesFromPorcelainV2, parseBranchSyncFromPorcelainV2 } from '@/utils/gitParsing';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';

type Toast = { msg: string; isError: boolean };
type Translate = (key: string) => string;
type TranslatePair = (deText: string, enText: string) => string;
type SetConfirmDialog = (dialog: ConfirmDialogState | null | ((prev: ConfirmDialogState | null) => ConfirmDialogState | null)) => void;

export type GitCommandGuardRequest = {
  args: string[];
  command: string;
  repoPath?: string | null;
  successMsg: string;
  actionLabel?: string;
  options?: RunGitCommandOptions;
};

export type GitCommandGuardRuntime = {
  isRepoCurrent: (repoPath?: string | null) => boolean;
  runRemoteAheadQuickFix: (params: { command: string; options?: RunGitCommandOptions }) => Promise<void>;
  runWithOptions: (args: string[], successMsg: string, actionLabel: string | undefined, options: RunGitCommandOptions | undefined) => Promise<void>;
  setConfirmDialog: SetConfirmDialog;
  setGitActionToast: (toast: Toast) => void;
  addSecretScanFindingsToAllowlist: (findings: { filePath: string }[]) => Promise<boolean>;
  t: Translate;
  tr: TranslatePair;
};

const commandLabel = (args: string[]) => `git ${args.join(' ')}`;
const boundOptions = (request: GitCommandGuardRequest, additions: RunGitCommandOptions = {}): RunGitCommandOptions => ({
  ...request.options,
  ...additions,
  expectedRepoPath: request.repoPath || request.options?.expectedRepoPath,
});

export const openForcePushGuard = (request: GitCommandGuardRequest, runtime: GitCommandGuardRuntime): boolean => {
  const { args, successMsg, actionLabel } = request;
  const { runWithOptions, setConfirmDialog, t } = runtime;

  if (!runtime.isRepoCurrent(request.repoPath)) return true;
  setConfirmDialog({
    variant: 'danger',
    title: t('generated.components.layout.workflows.usegitcommandguardworkflow.confirm_force_push_dd412d80'),
    message: t('generated.components.layout.workflows.usegitcommandguardworkflow.this_push_uses_force_options_and_can_overwrite_commits_o_86651249'),
    contextItems: [
      { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: commandLabel(args) },
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
        ...boundOptions(request, { skipDirtyGuard: true }),
      });
    },
  });
  return true;
};

export const openRemoteAheadDirtyStateGuard = async (request: GitCommandGuardRequest, runtime: GitCommandGuardRuntime): Promise<boolean> => {
  const { args, command, successMsg, actionLabel } = request;
  const { runRemoteAheadQuickFix, runWithOptions, setConfirmDialog, t, tr } = runtime;

  try {
    if (!request.repoPath) return false;
    const statusResult = await gitClient.runGitCommandForRepo(request.repoPath, 'status', '--porcelain=v2', '--branch');
    if (!runtime.isRepoCurrent(request.repoPath)) return true;
    const statusText = statusResult.success ? String(statusResult.data || '') : '';
    const remoteSyncState = parseBranchSyncFromPorcelainV2(statusText);
    const changedFiles = countChangedEntriesFromPorcelainV2(statusText);
    const hasBlockingState = changedFiles > 0 && remoteSyncState.hasUpstream && remoteSyncState.behind > 0;

    if (!hasBlockingState) return false;

    const isPushGuard = command === 'push';
    const behindCount = remoteSyncState.behind;
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
        { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: commandLabel(args) },
        { label: t('generated.components.layout.workflows.usegitcommandguardworkflow.remote_ahead_040a92ca'), value: String(behindCount) },
        {
          label: t('generated.components.layout.workflows.usegitcommandguardworkflow.local_changes_fc4435ff'),
          value: tr(`${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} uncommitted`, `${changedFiles} file${changedFiles === 1 ? '' : 's'} uncommitted`),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.workflows.usegitcommandguardworkflow.recommended_commit_or_stash_first_then_pull_optionally_r_53cb75a1'),
      confirmLabel: tr(isPushGuard ? 'Trotzdem pushen' : 'Trotzdem pullen', isPushGuard ? 'Push anyway' : 'Pull anyway'),
      secondaryActionLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.run_quick_fix_3c2a62d8'),
      secondaryActionVariant: 'default',
      onSecondaryAction: async () => {
        await runRemoteAheadQuickFix({ command, options: boundOptions(request) });
      },
      onConfirm: async () => {
        await runWithOptions(args, successMsg, actionLabel, {
          ...boundOptions(request, { skipRemoteAheadDirtyGuard: true }),
        });
      },
    });
    return true;
  } catch {
    if (!runtime.isRepoCurrent(request.repoPath)) return true;
    return false;
  }
};

export const openDirtyWorktreeGuard = async (request: GitCommandGuardRequest, runtime: GitCommandGuardRuntime): Promise<boolean> => {
  const { args, successMsg, actionLabel } = request;
  const { runWithOptions, setConfirmDialog, t, tr } = runtime;

  try {
    if (!request.repoPath) return false;
    const status = await gitClient.runGitCommandForRepo(request.repoPath, 'statusPorcelain');
    if (!runtime.isRepoCurrent(request.repoPath)) return true;
    const hasLocalChanges = Boolean(status.success && String(status.data || '').trim().length > 0);
    if (!hasLocalChanges) return false;

    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.layout.workflows.usegitcommandguardworkflow.uncommitted_changes_detected_833713ea'),
      message: tr(`Vor "git ${args.join(' ')}" wurden lokale Aenderungen gefunden.`, `Local changes were found before "git ${args.join(' ')}".`),
      contextItems: [
        { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: commandLabel(args) },
        {
          label: t('generated.components.layout.workflows.usegitcommandguardworkflow.hint_5628c320'),
          value: t('generated.components.layout.workflows.usegitcommandguardworkflow.working_tree_is_dirty_72dcc487'),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.workflows.usegitcommandguardworkflow.depending_on_the_operation_unstaged_or_staged_changes_ma_9d5cf90f'),
      confirmLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.run_anyway_bc5dff81'),
      onConfirm: async () => {
        await runWithOptions(args, successMsg, actionLabel, boundOptions(request, { skipDirtyGuard: true }));
      },
    });
    return true;
  } catch {
    if (!runtime.isRepoCurrent(request.repoPath)) return true;
    return false;
  }
};

export const runSecretScanGuard = async (request: GitCommandGuardRequest, runtime: GitCommandGuardRuntime, includeTags: boolean): Promise<boolean> => {
  const { args, successMsg, actionLabel } = request;
  const { runWithOptions, setConfirmDialog, setGitActionToast, t, tr } = runtime;

  if (!request.repoPath || !runtime.isRepoCurrent(request.repoPath)) return true;
  const repoPath = request.repoPath;
  try {
    const scanResult = await scanPushSecretsWithTimeout(includeTags, repoPath, args.slice(1));
    if (!runtime.isRepoCurrent(request.repoPath)) return true;
    if (!scanResult.success) {
      setGitActionToast({
        msg: scanResult.error || t('generated.components.layout.workflows.usegitcommandguardworkflow.secret_scan_before_push_failed_a33eb357'),
        isError: true,
      });
      return true;
    }

    const findings = scanResult.data.findings || [];
    if (findings.length === 0) return false;

    const contextItems = findings.slice(0, 8).map((finding, index) => ({
      label: tr(`Treffer ${index + 1}`, `Finding ${index + 1}`),
      value: `${finding.filePath}:${finding.lineNumber}  ${finding.contextLine}`,
    }));

    const continuePush = async () => {
      // Bind the approval to this exact push (args after the `push` command).
      const approval = await gitClient.approveSecretScanPush(args.slice(1), repoPath);
      if (!approval.success || !runtime.isRepoCurrent(request.repoPath)) {
        if (runtime.isRepoCurrent(request.repoPath)) {
          setGitActionToast({
            msg: tr(
              'Der Repository-Zustand hat sich geaendert. Bitte fuehre den Secret-Scan erneut aus.',
              'The repository state changed. Run the secret scan again before pushing.',
            ),
            isError: true,
          });
        }
        return;
      }
      await runWithOptions(args, successMsg, actionLabel, boundOptions(request, { skipSecretScan: true }));
    };

    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.layout.workflows.usegitcommandguardworkflow.potential_secrets_detected_before_push_deeb3751'),
      message: tr(
        `${findings.length} moegliche Secret-Treffer wurden in den zu veroeffentlichenden Aenderungen gefunden.`,
        `${findings.length} potential secret hit(s) were found in changes that would be published.`,
      ),
      contextItems,
      irreversible: true,
      consequences: t('generated.components.layout.workflows.usegitcommandguardworkflow.please_review_these_findings_pushing_can_irreversibly_pu_fb7def03'),
      confirmLabel: t('generated.components.layout.workflows.usegitcommandguardworkflow.push_anyway_46f5aba1'),
      secondaryActionLabel: tr('Dateien allowlisten und pushen', 'Allowlist files and push'),
      secondaryActionVariant: 'default',
      onSecondaryAction: async () => {
        if (!(await runtime.addSecretScanFindingsToAllowlist(findings))) return;
        await continuePush();
      },
      onConfirm: continuePush,
    });
    return true;
  } catch (error: any) {
    if (error?.message === '__timeout__') {
      if (request.repoPath) await gitClient.cancelSecretScan(request.repoPath);
      if (!runtime.isRepoCurrent(request.repoPath)) return true;
      return openSecretScanTimeoutDialog(request, runtime);
    }

    if (!runtime.isRepoCurrent(request.repoPath)) return true;
    setGitActionToast({
      msg: error?.message || t('generated.components.layout.workflows.usegitcommandguardworkflow.secret_scan_before_push_failed_a33eb357'),
      isError: true,
    });
    return true;
  }
};

const scanPushSecretsWithTimeout = async (
  includeTags: boolean,
  repoPath: string,
  pushArgs?: string[],
): Promise<Awaited<ReturnType<typeof gitClient.scanPushSecrets>>> => {
  // This is a last-resort hung-process deadline, not a performance budget.
  // Large repositories can legitimately need more than the former 15 seconds
  // even though the scan continues making progress locally.
  const scanTimeoutMs = 120_000;
  let scanTimeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    scanTimeoutId = window.setTimeout(() => reject(new Error('__timeout__')), scanTimeoutMs);
  });

  try {
    return await Promise.race([gitClient.scanPushSecrets({ includeTags, repoPath, pushArgs }), timeoutPromise]);
  } finally {
    if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId);
  }
};

const openSecretScanTimeoutDialog = (request: GitCommandGuardRequest, runtime: GitCommandGuardRuntime): boolean => {
  const { args, successMsg, actionLabel } = request;
  const { runWithOptions, setConfirmDialog, t, tr } = runtime;

  if (!request.repoPath || !runtime.isRepoCurrent(request.repoPath)) return true;
  const repoPath = request.repoPath;
  setConfirmDialog({
    variant: 'danger',
    title: t('generated.components.layout.workflows.usegitcommandguardworkflow.secret_scan_timed_out_307b8b8c'),
    message: tr(
      'Der Secret-Scan hat zu lange gedauert und wurde abgebrochen. Soll ein neuer Scan gestartet werden?',
      'The secret scan timed out and was cancelled. Start a fresh scan?',
    ),
    contextItems: [],
    irreversible: false,
    consequences: tr(
      'Der Push wird erst nach einem neuen, vollstaendigen Secret-Scan fortgesetzt.',
      'The push will continue only after a new secret scan completes.',
    ),
    confirmLabel: tr('Secret-Scan erneut starten', 'Retry secret scan'),
    onConfirm: async () => {
      if (!runtime.isRepoCurrent(repoPath)) return;
      await runWithOptions(args, successMsg, actionLabel, boundOptions(request, { skipSecretScan: false }));
    },
  });
  return true;
};
