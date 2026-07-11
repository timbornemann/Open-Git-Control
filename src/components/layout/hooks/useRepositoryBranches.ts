import { useCallback, useEffect, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { BranchInfo, GitMergeMode } from '@/types/git';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { normalizeBranchRefForMerge } from '@/utils/gitParsing';
import { validateBranchName } from '@/utils/gitRefValidation';
import { compactGitError, isNotFullyMergedBranchDeleteError } from '@/utils/gitPushRecovery';
import { gitClient } from '@/services/gitClient';
import type { BranchContextMenuState, ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildDeleteBranchDialog, buildForceDeleteBranchDialog, buildMergeBranchDialog, buildRenameBranchDialog } from './repositoryDomainDialogs';
import type { GitActionToast } from './repositoryDomainTypes';
import type { RunGitCommandOptions } from '@/app/state/contracts';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  hasRemoteOrigin: boolean | null;
  language: AppLanguage;
  setGitActionToast: (toast: GitActionToast) => void;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;
  triggerRefresh: () => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
};

const mergeModeArgs = (mode: GitMergeMode): string[] => {
  if (mode === 'noFf') return ['--no-ff'];
  if (mode === 'squash') return ['--squash'];
  if (mode === 'ffOnly') return ['--ff-only'];
  return [];
};

export const useRepositoryBranches = ({
  activeRepo,
  refreshTrigger,
  hasRemoteOrigin,
  language,
  setGitActionToast,
  runGitCommand,
  triggerRefresh,
  setConfirmDialog,
  setInputDialog,
}: Params) => {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchContextMenu, setBranchContextMenu] = useState<BranchContextMenuState>(null);
  const { t, tr } = useLanguageTranslations(language);

  const mergeModeLabel = useCallback(
    (mode: GitMergeMode): string => {
      if (mode === 'noFf') return t('generated.components.layout.hooks.userepositorydomain.no_fast_forward_no_ff_d4cc36d1');
      if (mode === 'squash') return t('generated.components.layout.hooks.userepositorydomain.squash_merge_squash_853a2803');
      if (mode === 'ffOnly') return t('generated.components.layout.branchcontextmenu.fast_forward_only_ff_only_247cf7fb');
      return t('generated.components.layout.hooks.userepositorydomain.default_921d6fef');
    },
    [t],
  );

  useLayoutEffect(() => {
    setBranches([]);
    setCurrentBranch('');
    setIsCreatingBranch(false);
    setBranchContextMenu(null);
  }, [activeRepo]);

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setBranches([]);
      setCurrentBranch('');
      return;
    }

    let cancelled = false;
    const fetchBranches = async () => {
      try {
        const { success, data } = await gitClient.runGitCommandForRepo(activeRepo, 'branch', '-a');
        if (cancelled) return;
        if (!success || !data) return;

        const parsedBranches = data
          .split('\n')
          .filter((line: string) => line.trim().length > 0)
          .map((line: string): BranchInfo | null => {
            const isHead = line.startsWith('*');
            const name = line.replace('*', '').trim();
            if (name.includes(' -> ')) return null;

            const scope: BranchInfo['scope'] = name.startsWith('remotes/') ? 'remote' : 'local';
            return { name, isHead, scope };
          })
          .filter((branch: BranchInfo | null): branch is BranchInfo => branch !== null);

        const headRaw = parsedBranches.find((branch) => branch.isHead)?.name ?? '';
        const head = /^\((HEAD detached|no branch)/i.test(headRaw) ? '' : headRaw;
        setCurrentBranch(head);
        setBranches(parsedBranches);
      } catch {
        // Keep the last known branch list during transient refresh failures.
      }
    };

    fetchBranches();
    return () => {
      cancelled = true;
    };
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    if (!branchContextMenu) return;
    const close = () => setBranchContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [branchContextMenu]);

  const handleCreateBranch = async (branchName: string) => {
    const repoAtStart = activeRepo;
    if (!repoAtStart) return;
    const name = branchName.trim();
    if (!name) return;
    if (validateBranchName(name)) {
      setGitActionToast({
        msg: t('generated.components.layout.hooks.userepositorydomain.invalid_branch_name_please_check_the_input_b2af4b45'),
        isError: true,
      });
      return;
    }

    setIsCreatingBranch(false);
    const created = await runGitCommand(gitClient.buildCreateBranchArgs(name), tr(`Branch "${name}" erstellt.`, `Created branch "${name}".`), undefined, {
      expectedRepoPath: repoAtStart,
    });
    if (!created || !hasRemoteOrigin) return;

    await runGitCommand(
      gitClient.buildPushCurrentBranchArgs({ remote: 'origin', ref: name, setUpstream: true }),
      tr(`Branch "${name}" erstellt, auf origin veroeffentlicht und Upstream gesetzt.`, `Created branch "${name}", pushed to origin, and set upstream.`),
      tr(`Neuer Branch "${name}" wird auf origin veroeffentlicht...`, `Publishing new branch "${name}" to origin...`),
      { expectedRepoPath: repoAtStart },
    );
  };

  const handleDeleteBranch = async (branchName: string) => {
    const repoAtStart = activeRepo;
    if (!repoAtStart) return;
    setConfirmDialog(
      buildDeleteBranchDialog({
        branchName,
        currentBranch,
        t,
        tr,
        onDelete: async () => {
          if (!gitClient.isAvailable()) return;
          const deleteArgs = gitClient.buildDeleteBranchArgs(branchName);
          const [command, ...rest] = deleteArgs;
          const result = await gitClient.runGitCommandForRepo(repoAtStart, command, ...rest);
          if (result.success) {
            setGitActionToast({
              msg: tr(`Branch "${branchName}" gelöscht.`, `Deleted branch "${branchName}".`),
              isError: false,
            });
            triggerRefresh();
            return;
          }

          if (isNotFullyMergedBranchDeleteError(result.error)) {
            setConfirmDialog(
              buildForceDeleteBranchDialog({
                branchName,
                t,
                tr,
                onForceDelete: async () => {
                  await runGitCommand(
                    gitClient.buildDeleteBranchArgs(branchName, { force: true }),
                    tr(`Branch "${branchName}" force-gelöscht.`, `Force-deleted branch "${branchName}".`),
                    undefined,
                    { expectedRepoPath: repoAtStart },
                  );
                },
              }),
            );
            return;
          }

          setGitActionToast({
            msg: compactGitError(result.error) || tr(`Branch "${branchName}" konnte nicht gelöscht werden.`, `Could not delete branch "${branchName}".`),
            isError: true,
          });
        },
      }),
    );
  };

  const handleMergeBranch = async (branchName: string, mode: GitMergeMode = 'default') => {
    const repoAtStart = activeRepo;
    if (!repoAtStart) return;
    const mergeTarget = normalizeBranchRefForMerge(branchName);
    const flags = mergeModeArgs(mode);
    const mergeArgs = gitClient.buildMergeBranchArgs(mergeTarget, flags);
    const commandPreview = mergeArgs.join(' ');
    setConfirmDialog(
      buildMergeBranchDialog({
        branchName,
        currentBranch,
        mergeTarget,
        mergeModeLabel: mergeModeLabel(mode),
        commandPreview,
        t,
        tr,
        onMerge: async () => {
          const successMsg =
            mode === 'squash'
              ? tr(
                  `Squash-Merge von "${mergeTarget}" vorbereitet. Aenderungen sind gestaged — bitte committen.`,
                  `Squash merge of "${mergeTarget}" prepared. Changes are staged — please commit.`,
                )
              : tr(`Branch "${mergeTarget}" gemergt.`, `Merged branch "${mergeTarget}".`);
          await runGitCommand(mergeArgs, successMsg, undefined, { expectedRepoPath: repoAtStart });
        },
      }),
    );
  };

  const handleRenameBranch = async (oldName: string) => {
    const repoAtStart = activeRepo;
    if (!repoAtStart) return;
    setInputDialog(
      buildRenameBranchDialog({
        oldName,
        t,
        tr,
        onRename: async (newName) => {
          await runGitCommand(
            gitClient.buildRenameBranchArgs(oldName, newName),
            tr(`Branch umbenannt: "${oldName}" -> "${newName}".`, `Renamed branch: "${oldName}" -> "${newName}".`),
            undefined,
            { expectedRepoPath: repoAtStart },
          );
        },
      }),
    );
  };

  return {
    branches,
    setBranches,
    currentBranch,
    setCurrentBranch,
    isCreatingBranch,
    setIsCreatingBranch,
    branchContextMenu,
    setBranchContextMenu,
    handleCreateBranch,
    handleDeleteBranch,
    handleMergeBranch,
    handleRenameBranch,
  };
};
