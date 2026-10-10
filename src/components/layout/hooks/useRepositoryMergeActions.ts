import { useLayoutEffect, useRef } from 'react';
import type { BranchInfo, GitMergeDirection, GitMergeMode } from '@/types/git';
import type { ConfirmDialogState, RunGitCommandOptions } from '@/app/state/contracts';
import { gitClient } from '@/services/gitClient';
import { freshRead } from '@/data/clientCache';
import { normalizeBranchRefForMerge } from '@/utils/gitParsing';
import { mergeModeFlags } from '@/shared/git/merge';
import { buildMergeBranchDialog } from './repositoryDomainDialogs';
import type { RepositoryTranslator, GitActionToast } from './repositoryDomainTypes';
import { confirmWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';

type Params = Pick<RepositoryTranslator, 'tr'> & {
  activeRepo: string | null;
  currentBranch: string;
  branches: BranchInfo[];
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;
  setConfirmDialog: (dialog: ConfirmDialogState) => void;
  setGitActionToast: (toast: GitActionToast) => void;
};

export function useRepositoryMergeActions({ activeRepo, currentBranch, branches, runGitCommand, setConfirmDialog, setGitActionToast, tr }: Params) {
  const context = useRef({ activeRepo, currentBranch });
  const generation = useRef(0);
  useLayoutEffect(() => {
    const scopeGeneration = generation;
    context.current = { activeRepo, currentBranch };
    scopeGeneration.current++;
    return () => {
      scopeGeneration.current++;
    };
  }, [activeRepo, currentBranch]);

  return async (branchName: string, mode: GitMergeMode = 'default', direction: GitMergeDirection = 'intoCurrent') => {
    if (!activeRepo) return;
    const repoPath = activeRepo,
      branchAtStart = currentBranch,
      requestId = ++generation.current;
    const stillCurrent = () => context.current.activeRepo === repoPath && context.current.currentBranch === branchAtStart && generation.current === requestId;
    const switchTarget = direction === 'intoSelected';
    const sourceBranch = switchTarget ? currentBranch : normalizeBranchRefForMerge(branchName);
    const targetBranch = switchTarget ? branchName : currentBranch || tr('Aktueller Checkout (Detached HEAD)', 'Current checkout (detached HEAD)');
    if (!(await confirmWorkingDirectoryNavigation({ kind: 'view', label: tr('Branches zusammenführen', 'Merge branches') })) || !stillCurrent()) return;
    let args = gitClient.buildMergeBranchArgs(sourceBranch, mergeModeFlags(mode));
    if (switchTarget) {
      if (!currentBranch || branchName === currentBranch || !branches.some((b) => b.scope === 'local' && b.name === branchName)) {
        setGitActionToast({
          msg: tr(
            'Wähle einen anderen lokalen Zielbranch. Bei Detached HEAD musst du zuerst einen Branch auswählen.',
            'Select another local target branch. With detached HEAD, choose a branch first.',
          ),
          isError: true,
        });
        return;
      }
      try {
        const [source, target, status] = await Promise.all([
          freshRead(() => gitClient.runGitCommandForRepo(repoPath, 'show', '-s', '--format=%H', `refs/heads/${sourceBranch}`)),
          freshRead(() => gitClient.runGitCommandForRepo(repoPath, 'show', '-s', '--format=%H', `refs/heads/${targetBranch}`)),
          freshRead(() => gitClient.runGitCommandForRepo(repoPath, 'statusPorcelain')),
        ]);
        if (!stillCurrent()) return;
        for (const result of [source, target, status]) if (!result.success) throw new Error(result.error);
        if (status.data?.trim())
          throw new Error(
            tr(
              'Committe oder stashe deine offenen Änderungen, bevor du in einen anderen Branch zusammenführst.',
              'Commit or stash your open changes before merging into another branch.',
            ),
          );
        const sourceOid = source.data?.trim() || '',
          targetOid = target.data?.trim() || '';
        if (![sourceOid, targetOid].every((oid) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(oid))) {
          throw new Error(
            tr(
              'Der Commit-Stand konnte nicht geprüft werden. Aktualisiere die Branches und versuche es erneut.',
              'Could not verify the branch commits. Refresh the branches and try again.',
            ),
          );
        }
        args = gitClient.buildMergeIntoBranchArgs({ sourceBranch, targetBranch, mode, sourceOid, targetOid });
      } catch (error) {
        if (stillCurrent()) setGitActionToast({ msg: error instanceof Error ? error.message : String(error), isError: true });
        return;
      }
    }
    if (!stillCurrent()) return;
    setConfirmDialog(
      buildMergeBranchDialog({
        sourceBranch,
        targetBranch,
        mode,
        switchTarget,
        tr,
        onMerge: async () => {
          if (!stillCurrent()) return;
          // A captured confirmation is single-use, even if the confirm key is repeated.
          const confirmationId = ++generation.current;
          if (!(await confirmWorkingDirectoryNavigation({ kind: 'view', label: tr('Branches zusammenführen', 'Merge branches') }))) return;
          if (context.current.activeRepo !== repoPath || context.current.currentBranch !== branchAtStart || generation.current !== confirmationId) return;
          const successMsg =
            mode === 'squash'
              ? tr(
                  `Änderungen aus „${sourceBranch}“ sind in „${targetBranch}“ gestaged. Erstelle jetzt deinen Commit.`,
                  `Changes from "${sourceBranch}" are staged in "${targetBranch}". Create your commit now.`,
                )
              : tr(`„${sourceBranch}“ wurde in „${targetBranch}“ zusammengeführt.`, `Merged "${sourceBranch}" into "${targetBranch}".`);
          await runGitCommand(args, successMsg, tr(`Zusammenführen in „${targetBranch}“…`, `Merging into "${targetBranch}"…`), { expectedRepoPath: repoPath });
        },
      }),
    );
  };
}
