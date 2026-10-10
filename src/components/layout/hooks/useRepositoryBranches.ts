import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey, withReadPriority } from '@/data/clientCache';
import type { IpcResult } from '@/types/ipc';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { BranchInfo } from '@/types/git';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { validateBranchName } from '@/utils/gitRefValidation';
import { compactGitError, isNotFullyMergedBranchDeleteError } from '@/utils/gitPushRecovery';
import { gitClient } from '@/services/gitClient';
import type { BranchContextMenuState, ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildDeleteBranchDialog, buildForceDeleteBranchDialog, buildRenameBranchDialog } from './repositoryDomainDialogs';
import { useRepositoryMergeActions } from './useRepositoryMergeActions';
import type { GitActionToast } from './repositoryDomainTypes';
import type { RunGitCommandOptions } from '@/app/state/contracts';
import { transferClient } from '@/services/hostingClient';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';

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

export const useRepositoryBranches = ({
  activeRepo,
  refreshTrigger,
  language,
  setGitActionToast,
  runGitCommand,
  triggerRefresh,
  setConfirmDialog,
  setInputDialog,
}: Params) => {
  const [loadedBranches, setBranches] = useState<BranchInfo[]>([]);
  const activeRepoRef = useRef(activeRepo);
  const [loadedCurrentBranch, setCurrentBranch] = useState('');
  const cached = useCachedResult<IpcResult<string>>(resourceKey('git', 'runGitCommandForRepo', [activeRepo, 'branch', '-a']));
  const branches = useMemo<BranchInfo[]>(
    () =>
      cached.data?.success
        ? cached.data.data
            .split('\n')
            .filter((line) => line.trim() && !line.includes(' -> '))
            .map((line) => {
              const name = line.replace(/^[*+]\s*/, '').trim();
              return { name, isHead: line.startsWith('*'), scope: name.startsWith('remotes/') ? 'remote' : 'local' };
            })
        : loadedBranches,
    [cached.data, loadedBranches],
  );
  const cachedHead = branches.find((branch) => branch.isHead)?.name || '';
  const currentBranch = cached.data?.success ? (/^\((HEAD detached|no branch)/i.test(cachedHead) ? '' : cachedHead) : loadedCurrentBranch;
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchContextMenu, setBranchContextMenu] = useState<BranchContextMenuState>(null);
  const { t, tr } = useLanguageTranslations(language);

  const handleMergeBranch = useRepositoryMergeActions({ activeRepo, currentBranch, branches, runGitCommand, setConfirmDialog, setGitActionToast, tr });

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
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
        const { success, data } = await withReadPriority(() => gitClient.runGitCommandForRepo(activeRepo, 'branch', '-a'), 'repository');
        if (cancelled) return;
        if (!success || !data) return;

        const parsedBranches = data
          .split('\n')
          .filter((line: string) => line.trim().length > 0)
          .map((line: string): BranchInfo | null => {
            const isHead = line.startsWith('*');
            const name = line.replace(/^[*+]\s*/, '').trim();
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
    if (!created || activeRepoRef.current !== repoAtStart) return;
    try {
      const snapshot = await transferClient.request('getRemotes', { repoPath: repoAtStart });
      if (activeRepoRef.current !== repoAtStart) return;
      if (snapshot.remotes.length)
        setConfirmDialog({
          variant: 'confirm',
          title: tr('Branch veröffentlichen', 'Publish branch'),
          message: tr(`Branch „${name}“ wurde lokal erstellt. Jetzt veröffentlichen?`, `Branch "${name}" was created locally. Publish it now?`),
          contextItems: [{ label: 'Branch', value: name }],
          irreversible: false,
          consequences: tr(
            'Die Push-Ziele folgen der Remote-Konfiguration. Der Upstream bleibt unverändert.',
            'Push targets follow the remote configuration. Upstream tracking stays unchanged.',
          ),
          confirmLabel: tr('Branch veröffentlichen', 'Publish branch'),
          onConfirm: () => {
            if (activeRepoRef.current !== repoAtStart) return;
            requestRemoteTransfer({ repoPath: repoAtStart, mode: 'push', destinationBranch: name, expectedBranch: name });
          },
        });
    } catch {
      // The local branch remains usable; publication can be opened from Push.
    }
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
