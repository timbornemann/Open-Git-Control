import type { BranchCleanupCandidate, BranchCleanupInspection } from '@/shared/ipc/branchCleanup';

export function cleanupCandidate(id: string, extra: Partial<BranchCleanupCandidate> = {}): BranchCleanupCandidate {
  return {
    id,
    kind: 'local',
    name: id,
    ref: `refs/heads/${id}`,
    oid: 'a'.repeat(40),
    comparisonId: 'local',
    targetId: 'main-target',
    lastCommitAt: Date.parse('2026-01-01'),
    unmergedCommitCount: 0,
    classification: 'merged',
    reasons: [{ code: 'merged' }],
    blocks: [],
    worktrees: [],
    requiresForce: false,
    selectedByDefault: true,
    linkedLocalIds: [],
    ...extra,
  };
}
export function cleanupInspection(): BranchCleanupInspection {
  const server = cleanupCandidate('server-done', {
    kind: 'server',
    comparisonId: 'origin',
    targetId: 'server-target',
    endpoint: 'https://example.test/team/repo.git',
    remoteName: 'origin',
    selectedByDefault: false,
  });
  const forced = cleanupCandidate('orphaned', {
    classification: 'orphaned',
    unmergedCommitCount: 2,
    reasons: [{ code: 'upstream-gone' }],
    requiresForce: true,
    selectedByDefault: false,
  });
  return {
    id: 'plan',
    repoPath: 'C:/repo',
    createdAt: Date.now(),
    expiresAt: Date.now() + 900_000,
    candidates: [
      cleanupCandidate('local-done'),
      server,
      forced,
      cleanupCandidate('main', { blocks: [{ code: 'current' }, { code: 'protected' }], selectedByDefault: false }),
    ],
    targets: [
      { id: 'main-target', comparisonId: 'local', name: 'main', oid: 'b'.repeat(40) },
      { id: 'other-target', comparisonId: 'local', name: 'integration', oid: 'c'.repeat(40) },
      { id: 'server-target', comparisonId: 'origin', name: 'main', oid: 'b'.repeat(40) },
    ],
    comparisons: [
      { id: 'local', label: 'local', targetId: 'main-target' },
      { id: 'origin', label: 'origin (https://example.test/team/repo.git)', targetId: 'server-target' },
    ],
    warnings: [],
    protectedPatterns: ['main', 'master', 'develop', 'development'],
  };
}
