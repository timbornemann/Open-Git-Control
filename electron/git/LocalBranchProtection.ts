import { PRIMARY_BRANCH_NAMES, PROTECTED_BRANCH_ERROR, isPrimaryBranchName } from '../../src/shared/git/branchProtection';
import { gitConfigurationEntries } from './GitConfigurationEntries';
import type { CommitEditGit } from './CommitEditGit';

/** Local protection also works offline, using the recorded remote HEAD refs and effective Git configuration. */
export async function readProtectedLocalBranches(repo: string, git: Pick<CommitEditGit, 'run'>): Promise<Set<string>> {
  const [refs, rawConfig] = await Promise.all([
    git.run(repo, ['for-each-ref', '--format=%(refname)%00%(symref)', 'refs/remotes/']),
    git.run(repo, ['config', '--null', '--list']),
  ]);
  const config = new Map(gitConfigurationEntries(rawConfig));
  const names = new Set(PRIMARY_BRANCH_NAMES);
  const configured = config.get('init.defaultbranch');
  if (configured) names.add(configured);
  for (const line of refs.split(/\r?\n/)) {
    const [ref, target] = line.split('\0');
    if (!ref?.startsWith('refs/remotes/') || !ref.endsWith('/HEAD')) continue;
    const prefix = ref.slice(0, -'HEAD'.length);
    if (!target?.startsWith(prefix) || target === ref) continue;
    const name = target.slice(prefix.length);
    names.add(name);
  }
  return names;
}

export function assertLocalBranchDeletionAllowed(name: string, protectedNames: ReadonlySet<string>): void {
  const protectedName =
    protectedNames.has(name) ||
    isPrimaryBranchName(name) ||
    (process.platform === 'win32' && [...protectedNames].some((primary) => primary.toLowerCase() === name.toLowerCase()));
  if (protectedName) throw new Error(`${PROTECTED_BRANCH_ERROR} Local primary branch "${name}" cannot be deleted.`);
}
