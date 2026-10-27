import { isForcePushCommand } from '@/components/layout/state/appStateShared';
import { gitClient } from '@/services/gitClient';

type Preparation = { args: string[] } | { result: boolean };

/** Explicit leases survive every dialog/retry; only an implicit request needs a fresh snapshot. */
export async function prepareForcePushCommand(
  args: string[],
  repoPath: string,
  isCurrent: () => boolean,
  recover: (error: string) => Promise<boolean>,
): Promise<Preparation> {
  const implicit = args.some((arg) => arg === '--force-with-lease' || (arg.startsWith('--force-with-lease=') && !arg.includes(':')));
  if (!isForcePushCommand(args) || !implicit) return { args };
  const prepared = await gitClient.runGitCommandForRepo(repoPath, 'prepareForcePush', ...args.slice(1));
  if (!isCurrent()) return { result: false };
  if (!prepared.success) return { result: await recover(prepared.error) };
  const pinned: unknown = JSON.parse(prepared.data);
  if (!Array.isArray(pinned) || pinned[0] !== 'push' || pinned.some((arg) => typeof arg !== 'string')) throw new Error('Invalid prepared push.');
  return { args: pinned };
}
