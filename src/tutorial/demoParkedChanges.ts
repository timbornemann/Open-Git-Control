import type { BranchChangeInspection, BranchChangeResult, BranchChangeTarget, ParkedBranchChange } from '@/shared/ipc/branchChange';
import type { IpcResult } from '@/types/ipc';
import { ok, type DemoRepository } from './demoRepository';
import { demoCheckout } from './demoBranchCommands';
import { createDemoStash, applyDemoStash, dropDemoStash } from './demoStashState';

export function listDemoParkedChanges(repo: DemoRepository): ParkedBranchChange[] {
  repo.parkedChanges = repo.parkedChanges.filter((session) =>
    repo.stashes.some((stash) => stash.hash === session.stashOid && stash.subject.includes('[OGC:' + session.id + ']')),
  );
  return structuredClone(
    repo.parkedChanges.map((session) => ({
      ...session,
      currentBranch: repo.branch,
      currentHead: repo.commits[0]?.hash,
      currentWorktree: session.worktree === repo.activeRepo,
    })),
  );
}
export function parkDemoBranchChanges(repo: DemoRepository, args: string[], target: BranchChangeTarget, name: string): IpcResult<BranchChangeResult> {
  const id = crypto.randomUUID();
  const snapshot = createDemoStash(repo, '[OGC:' + id + '] ' + name.trim(), true);
  if (!snapshot) {
    const result = demoCheckout(repo, args);
    return result.success ? ok({ switched: true, restored: true, conflicts: [] }) : result;
  }
  const session: ParkedBranchChange = {
    id,
    name: name.trim(),
    sourceBranch: snapshot.branch,
    sourceHead: snapshot.baseHash,
    targetBranch: target.kind === 'detached' ? target.ref : target.branch,
    worktree: repo.activeRepo,
    createdAt: Date.parse(repo.commits.find((commit) => commit.hash === snapshot.hash)!.date),
    phase: 'stashed',
    stashOid: snapshot.hash,
  };
  repo.parkedChanges.unshift(session);
  const checkout = demoCheckout(repo, args);
  session.phase = checkout.success ? 'switched' : 'stashed';
  if (!checkout.success) session.error = checkout.error;
  repo.mark('changes-parked');
  return ok({
    switched: checkout.success,
    restored: false,
    session: listDemoParkedChanges(repo).find((entry) => entry.id === id),
    ...(checkout.success ? {} : { error: checkout.error }),
    conflicts: [],
  });
}
export function inspectDemoParkedChanges(repo: DemoRepository, id: string, reviewed = false): Omit<BranchChangeInspection, 'planId'> {
  const session = listDemoParkedChanges(repo).find((entry) => entry.id === id);
  if (!session) throw Error('The parked changes are no longer available.');
  const snapshot = session.stashOid && repo.stashSnapshots.get(session.stashOid);
  if (!snapshot) throw Error('The saved stash is missing.');
  const blocks = [];
  if (session.worktree !== repo.activeRepo) blocks.push('Restore these changes in their original worktree.');
  if (repo.conflicted || repo.mergeState) blocks.push('Finish or abort the pending practice merge first.');
  if (repo.changeCount()) blocks.push('Commit or park the current changes before restoring.');
  if (['applied', 'applying', 'conflict'].includes(session.phase) && !reviewed)
    blocks.push('Review the previous restoration before applying these changes again.');
  return {
    repoPath: repo.activeRepo,
    sourceBranch: repo.branch,
    sourceHead: repo.commits[0]?.hash || '',
    targetSha: repo.commits[0]?.hash || '',
    files: structuredClone(snapshot.files),
    blocks,
    conflicts: [...(repo.mergeState?.conflicts.keys() || [])],
    suggestedName: session.name,
    session,
    recoveryReviewed: reviewed,
    stashParents: { base: snapshot.baseHash, index: snapshot.indexHash, untracked: snapshot.untrackedHash },
  };
}
export function restoreDemoParkedChanges(repo: DemoRepository, inspection: BranchChangeInspection): BranchChangeResult {
  const session = listDemoParkedChanges(repo).find((entry) => entry.id === inspection.session?.id);
  if (!session || !inspection.session || session.stashOid !== inspection.session.stashOid || session.phase !== inspection.session.phase)
    throw Error('The saved changes differ from the reviewed state.');
  const snapshot = session.stashOid && repo.stashSnapshots.get(session.stashOid);
  if (!snapshot) throw Error('The saved stash is missing.');
  if (['applied', 'applying', 'conflict'].includes(session.phase) && !inspection.recoveryReviewed)
    throw Error('Review the restoration state before applying again.');
  applyDemoStash(repo, snapshot, true);
  dropDemoStash(repo, snapshot.hash);
  repo.mark('changes-restored');
  return { switched: false, restored: true, conflicts: [] };
}
