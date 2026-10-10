import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitRunner } from './GitRunner';
import type { CommitEditGit } from './CommitEditGit';
import { MERGE_MODES, mergeModeFlags, type MergeIntoBranchRequest } from '../../src/shared/git/merge';

const oidPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

async function assertBranchState(git: CommitEditGit, repoPath: string, request: MergeIntoBranchRequest, activeBranch: string) {
  const current = (await git.run(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  if (current !== activeBranch) throw new Error('The active branch changed. Open the merge menu again.');
  for (const [branch, oid] of [
    [request.sourceBranch, request.sourceOid],
    [request.targetBranch, request.targetOid],
  ]) {
    const actual = (await git.run(repoPath, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])).trim();
    if (actual !== oid) throw new Error(`Branch "${branch}" changed. Open the merge menu again.`);
  }
}

async function assertCleanState(git: CommitEditGit, repoPath: string) {
  const gitDir = (await git.run(repoPath, ['rev-parse', '--absolute-git-dir'])).trim();
  const markers = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_START'];
  if (markers.some((marker) => fs.existsSync(path.join(gitDir, marker)))) {
    throw new Error('Another Git operation is in progress. Finish or abort it before merging into another branch.');
  }
  if ((await git.run(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'])).length) {
    throw new Error('Commit or stash your open changes before merging into another branch.');
  }
}

/** Validation, checkout and merge occupy one exclusive repository write lane. */
export function mergeIntoBranch(
  runner: GitRunner,
  repoPath: string,
  request: MergeIntoBranchRequest,
  assertRepositoryCurrent: () => void = () => {},
): Promise<string> {
  if (!MERGE_MODES.includes(request.mode) || !oidPattern.test(request.sourceOid) || !oidPattern.test(request.targetOid)) {
    throw new Error('Invalid merge request.');
  }
  if (request.sourceBranch === request.targetBranch) throw new Error('Select a different target branch.');
  return runner.withExclusiveWrite(repoPath, 'merge-into-branch', async (git) => {
    assertRepositoryCurrent();
    for (const branch of [request.sourceBranch, request.targetBranch]) {
      if (!branch || branch.startsWith('-')) throw new Error('Invalid branch name.');
      await git.run(repoPath, ['check-ref-format', `refs/heads/${branch}`]);
    }
    await assertBranchState(git, repoPath, request, request.sourceBranch);
    await assertCleanState(git, repoPath);
    assertRepositoryCurrent();
    await git.run(repoPath, ['checkout', '--no-guess', '--no-overwrite-ignore', request.targetBranch]);
    try {
      assertRepositoryCurrent();
      await assertBranchState(git, repoPath, request, request.targetBranch);
      await assertCleanState(git, repoPath);
      const message = `Merge branch '${request.sourceBranch}' into ${request.targetBranch}`;
      const args = ['merge', ...mergeModeFlags(request.mode), '--no-edit'];
      if (request.mode !== 'squash') args.push('-m', message);
      args.push(request.sourceOid);
      return await git.run(repoPath, args, { envOverrides: { GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' } });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Merge into "${request.targetBranch}" did not finish. This target branch remains active. Review the details below; resolve any conflicts there before continuing.\n${details}`,
      );
    }
  });
}
