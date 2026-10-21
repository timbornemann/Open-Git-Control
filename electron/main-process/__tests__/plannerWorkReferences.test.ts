import { describe, expect, it } from 'vitest';
import { mergeWorkReferences } from '../plannerWorkReferences';
import { workDigest } from '../PlannerWorkStore';
import type { PlannerBranchReference } from '../../../src/types/projectPlanner';
const branch: PlannerBranchReference = {
  id: 'workflow',
  projectId: 'project',
  name: 'task/work',
  baseRef: 'refs/heads/main',
  baseSha: 'a'.repeat(40),
  startedAt: 1,
  automationPaused: false,
};
describe('workflow references during checkout', () => {
  it('keeps completed history present only on the base without replacing the chosen active workflow', () => {
    const source = { activeWorkflowId: 'workflow', branches: [branch], pullRequests: [] };
    const result = mergeWorkReferences(source, { branches: [{ ...branch, id: 'old', completedBy: 'merged' }], pullRequests: [] });
    expect(result.branches.map((entry) => entry.id)).toEqual(['workflow', 'old']);
    expect(result.activeWorkflowId).toBe('workflow');
    expect(source.branches).toHaveLength(1);
  });
  it('refuses an unknown active assignment and conflicting repository/base identities', () => {
    expect(() => mergeWorkReferences(undefined, { activeWorkflowId: 'workflow', branches: [branch], pullRequests: [] })).toThrow('conflicting task references');
    expect(() =>
      mergeWorkReferences({ branches: [branch], pullRequests: [] }, { branches: [{ ...branch, baseSha: 'b'.repeat(40) }], pullRequests: [] }),
    ).toThrow('Conflicting workflow identity');
  });
  it('keeps a known source rename and distinguishes absent values in revision digests', () => {
    expect(
      mergeWorkReferences({ branches: [{ ...branch, name: 'task/renamed' }], pullRequests: [] }, { branches: [branch], pullRequests: [] }).branches[0].name,
    ).toBe('task/renamed');
    expect(workDigest(undefined)).not.toBe(workDigest(null));
    expect(workDigest(undefined)).toBe(workDigest(undefined));
  });
});
