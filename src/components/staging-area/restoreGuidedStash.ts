import type { GitStashEntryDto } from '@/types/gitDtos';
import { branchChangeClient } from '@/services/branchChangeClient';
import { requestParkedChanges } from '@/components/branch-change/branchChangeDialogState';

export const isGuidedStash = (stash: GitStashEntryDto | undefined, op: string) => Boolean(stash && op !== 'drop' && /\[OGC:[a-f0-9-]+\]/.test(stash.subject));

export async function restoreGuidedStash(
  repo: string,
  stash: GitStashEntryDto | undefined,
  op: string,
  current: () => boolean,
  tr: (de: string, en: string) => string,
) {
  if (!stash || !isGuidedStash(stash, op)) return false;
  const sessions = await branchChangeClient.listParkedBranchChanges(repo);
  if (!current()) return true;
  if (!sessions.success) throw new Error(sessions.error);
  const session = sessions.data.find((entry) => entry.stashOid === stash.hash);
  if (!session)
    throw new Error(
      tr(
        'Der geführte Stash ist nicht mehr zugeordnet. Prüfe den gespeicherten Arbeitsstand.',
        'The guided stash is no longer assigned. Review the saved changes.',
      ),
    );
  await requestParkedChanges(repo, session.id);
  return true;
}
