import * as fs from 'node:fs';
import * as path from 'node:path';
import { gitConfigurationEntries } from './GitConfigurationEntries';
import { CLEANUP_OID, cleanupDigest, type CleanupGit, type CleanupLocalState } from './branchCleanupModel';
import { physicalPathKey } from './RepositoryCommonDirectory';

const OPERATION_MARKERS = ['rebase-merge', 'rebase-apply', 'sequencer', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG'];

export async function readCleanupLocal(git: CleanupGit, repo: string): Promise<CleanupLocalState> {
  const [rawBranches, rawWorktrees, config, rawGitDir, rawCommon, shallow, replacements] = await Promise.all([
    git.run(repo, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(HEAD)', 'refs/heads/']),
    git.run(repo, ['worktree', 'list', '--porcelain', '-z']),
    git.run(repo, ['config', '--null', '--list']),
    git.run(repo, ['rev-parse', '--absolute-git-dir']),
    git.run(repo, ['rev-parse', '--git-common-dir']),
    git.run(repo, ['rev-parse', '--is-shallow-repository']),
    git.run(repo, ['for-each-ref', '--format=%(refname)', 'refs/replace/']),
  ]);
  const gitDir = path.resolve(repo, rawGitDir.trim());
  const commonDir = path.resolve(repo, rawCommon.trim());
  const configValues = new Map(gitConfigurationEntries(config));
  let current = '';
  const branches = rawBranches
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref, oid, timestamp, head] = line.replace(/\r$/, '').split('\0');
      if (!ref?.startsWith('refs/heads/') || !CLEANUP_OID.test(oid)) throw new Error('Incomplete local branch inventory.');
      const name = ref.slice(11);
      if (head === '*') current = name;
      const date = Number(timestamp);
      return {
        name,
        ref,
        oid,
        lastCommitAt: timestamp && Number.isFinite(date) ? date * 1000 : null,
        remote: configValues.get(`branch.${name}.remote`) ?? '',
        remoteRef: configValues.get(`branch.${name}.merge`) ?? '',
      };
    });
  const worktrees = rawWorktrees
    .split('\0\0')
    .filter((record) => record.trim())
    .map((record) => {
      const fields = record.split('\0');
      const worktreePath = fields.find((field) => field.startsWith('worktree '))?.slice(9);
      const branchRef = fields.find((field) => field.startsWith('branch '))?.slice(7) ?? '';
      const head = fields.find((field) => field.startsWith('HEAD '))?.slice(5) ?? '';
      if (!worktreePath || (branchRef && !branchRef.startsWith('refs/heads/')) || (head && !CLEANUP_OID.test(head)))
        throw new Error('Incomplete worktree inventory.');
      return { path: worktreePath, branch: branchRef.replace(/^refs\/heads\//, ''), head };
    });
  if (!worktrees.length) throw new Error('Worktree inventory is unavailable.');
  const worktreeDirs = path.join(commonDir, 'worktrees');
  const registeredDirs = fs.existsSync(worktreeDirs) ? fs.readdirSync(worktreeDirs).map((name) => path.join(worktreeDirs, name)) : [];
  const operation = [...new Set([gitDir, commonDir, ...registeredDirs])]
    .flatMap((directory) => OPERATION_MARKERS.filter((marker) => fs.existsSync(path.join(directory, marker))).map((marker) => `${directory}: ${marker}`))
    .join('\n');
  return {
    branches,
    config,
    configValues,
    current,
    commonDir,
    gitDir,
    worktrees,
    worktreeVersion: cleanupDigest(
      worktrees.map((worktree) => ({ ...worktree, path: physicalPathKey(worktree.path) })).sort((a, b) => a.path.localeCompare(b.path)),
    ),
    operation,
    incomplete: shallow.trim() === 'true' || Boolean(replacements.trim()) || fs.existsSync(path.join(commonDir, 'info', 'grafts')),
  };
}
