import type { BranchCleanupCandidate, BranchCleanupInspection } from '@/shared/ipc/branchCleanup';
import { cleanupPatternMatches } from '@/shared/git/branchCleanupProtection';
import { isPrimaryBranchName } from '@/shared/git/branchProtection';
import type { DemoRepository } from './demoRepository';

function ancestors(repo: DemoRepository, start: string): Set<string> | null {
  const objects = new Map(repo.commits.map((commit) => [commit.hash, commit]));
  const hashes = new Set<string>(),
    pending = [start];
  while (pending.length) {
    const hash = pending.pop()!;
    if (hashes.has(hash)) continue;
    const object = objects.get(hash);
    if (!object) return null;
    hashes.add(hash);
    pending.push(...object.parent.split(/\s+/).filter(Boolean));
  }
  return hashes;
}

/** This offline exercise inspects local refs. Server deletion needs its own verified inventory. */
export function inspectDemoCleanup(repo: DemoRepository, id: string, overrides: Record<string, string>, now: number): BranchCleanupInspection {
  const targets = [
    ...[...repo.branchHeads].map(([name, oid]) => ({ id: 'local-' + encodeURIComponent(name), name, oid, comparisonId: 'local' })),
    ...[...repo.remoteHeads].map(([name, oid]) => ({ id: 'remote-' + encodeURIComponent(name), name, oid, comparisonId: 'local' })),
  ];
  let preferred = targets.find((target) => target.name === 'main') || targets.find((target) => target.name === 'master');
  const remote = targets.find((target) => target.name === 'origin/main');
  if (preferred && remote && ancestors(repo, remote.oid)?.has(preferred.oid)) preferred = remote.oid === preferred.oid ? preferred : remote;
  const targetId = Object.prototype.hasOwnProperty.call(overrides, 'local') ? overrides.local : preferred?.id;
  const target = targets.find((entry) => entry.id === targetId);
  const targetHistory = target ? ancestors(repo, target.oid) : null;
  const candidates = [...repo.branchHeads].map(([name, oid]): BranchCleanupCandidate => {
    const history = ancestors(repo, oid);
    const count = history && targetHistory ? [...history].filter((hash) => !targetHistory.has(hash)).length : null;
    const blocks: BranchCleanupCandidate['blocks'] = [];
    if (name === repo.branch) blocks.push({ code: 'current' });
    if (isPrimaryBranchName(name) || name === target?.name || repo.branchProtectionPatterns.some((pattern) => cleanupPatternMatches(name, pattern)))
      blocks.push({ code: 'protected' });
    if (repo.conflicted || repo.mergeState) blocks.push({ code: 'operation', detail: 'merge' });
    if (!target) blocks.push({ code: 'missing-target' });
    else if (count === null) blocks.push({ code: 'incomplete-history' });
    const upstream = repo.branchUpstreams.get(name);
    const gone = upstream && !repo.remoteHeads.has(upstream);
    const classification = count === 0 ? 'merged' : gone ? 'orphaned' : 'other';
    const lastCommitAt = Date.parse(repo.commits.find((commit) => commit.hash === oid)?.date || '');
    return {
      id: 'local-' + encodeURIComponent(name),
      name,
      oid,
      ref: 'refs/heads/' + name,
      kind: 'local',
      comparisonId: 'local',
      targetId: target?.id ?? null,
      lastCommitAt: Number.isFinite(lastCommitAt) ? lastCommitAt : null,
      unmergedCommitCount: count,
      classification,
      upstream,
      reasons: count === 0 ? [{ code: 'merged', detail: target?.name }] : gone ? [{ code: 'upstream-gone', detail: upstream }] : [{ code: 'manual-review' }],
      blocks,
      worktrees: [],
      requiresForce: count !== 0,
      selectedByDefault: count === 0 && !blocks.length,
      linkedLocalIds: [],
    };
  });
  return {
    id,
    repoPath: repo.activeRepo,
    createdAt: now,
    expiresAt: now + 300_000,
    targets,
    comparisons: [{ id: 'local', label: 'local', targetId: target?.id ?? null }],
    candidates,
    warnings: [],
    protectedPatterns: [...repo.branchProtectionPatterns],
  };
}
