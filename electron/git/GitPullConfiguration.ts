import type { GitPullConfigurationDto, PullMode } from '../../src/types/remoteTransfers';
import type { Runner } from './remoteTransferModels';
import { redactGitSensitiveText } from './GitErrorFormatter';

export function pullStrategyArguments(mode: PullMode, autostash?: boolean): string[] {
  const flags: Record<PullMode, string[]> = {
    default: [],
    rebase: ['--rebase'],
    merge: ['--no-rebase'],
    'no-ff': ['--no-rebase', '--no-ff'],
    'ff-only': ['--ff-only'],
  };
  if (!Object.hasOwn(flags, mode)) throw new Error('Unsupported pull strategy.');
  if (autostash !== undefined && typeof autostash !== 'boolean') throw new Error('Invalid pull autostash option.');
  return [...flags[mode], ...(autostash ? ['--autostash'] : [])];
}

/** Git resolves includes, global, local and worktree scopes; branch rebase overrides pull.rebase. */
export async function readGitPullConfiguration(repoPath: string, git: Pick<Runner, 'runResult'>, signal?: AbortSignal): Promise<GitPullConfigurationDto> {
  const [head, config] = await Promise.all([
    git.runResult(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { signal }),
    git.runResult(repoPath, ['config', '--null', '--get-regexp', '^(pull\\.(rebase|ff)|merge\\.ff|branch\\..*\\.(rebase|mergeoptions))$'], { signal }),
  ]);
  for (const result of [head, config]) {
    if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(redactGitSensitiveText(result.stderr || 'Could not read Git pull configuration.'));
  }
  const branch = head.exitCode === 0 ? head.stdout.trim() : '';
  const values = new Map<string, string | null>();
  for (const entry of config.stdout.split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\n');
    values.set(separator < 0 ? entry : entry.slice(0, separator), separator < 0 ? null : entry.slice(separator + 1));
  }
  const boolean = async (key: string): Promise<'true' | 'false'> => {
    const result = await git.runResult(repoPath, ['config', '--type=bool', '--get', key], { signal });
    if (result.exitCode !== 0) throw new Error(redactGitSensitiveText(result.stderr || `Could not read ${key}.`));
    return result.stdout.trim() === 'true' ? 'true' : 'false';
  };
  const branchKey = `branch.${branch}.rebase`;
  const rebaseKey = branch && values.has(branchKey) ? branchKey : values.has('pull.rebase') ? 'pull.rebase' : null;
  const rebaseValue = rebaseKey ? values.get(rebaseKey) : null;
  const rebase: GitPullConfigurationDto['rebase'] = rebaseKey
    ? {
        key: rebaseKey,
        value:
          rebaseValue === 'merges' || rebaseValue === 'm'
            ? 'merges'
            : rebaseValue === 'interactive' || rebaseValue === 'i'
              ? 'interactive'
              : await boolean(rebaseKey),
      }
    : null;
  // merge.ff matters only when pull uses merge and pull.ff does not override it.
  const ffKey = values.has('pull.ff') ? 'pull.ff' : (!rebase || rebase.value === 'false') && values.has('merge.ff') ? 'merge.ff' : null;
  const fastForward: GitPullConfigurationDto['fastForward'] = ffKey
    ? { key: ffKey, value: values.get(ffKey) === 'only' ? 'only' : await boolean(ffKey) }
    : null;
  return { branch, rebase, fastForward, mergeOptions: values.get(`branch.${branch}.mergeoptions`) ?? null };
}
