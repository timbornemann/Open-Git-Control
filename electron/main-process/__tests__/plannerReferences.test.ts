import { describe, expect, it } from 'vitest';
import { normalizeProjectPlannerData } from '../projectPlannerData';
import { normalizePlannerReferences } from '../plannerReferences';
import { serializeRepositoryPlanningFile, parsePlannerData, renumberRepositoryPlannerData } from '../repositoryPlanningFile';
import { updatePlannerItemInData } from '../projectPlannerStore';
import { activePlannerBranch } from '../../../src/shared/plannerWork';
import type { ProjectPlannerData } from '../../../src/types/projectPlanner';

const reference = {
  activeWorkflowId: 'work-1',
  branches: [
    { id: 'work-1', projectId: 'project-1', name: 'task/example', baseRef: 'refs/heads/main', baseSha: 'a'.repeat(40), startedAt: 1, automationPaused: false },
  ],
  pullRequests: [
    {
      provider: 'github' as const,
      server: 'https://github.com',
      repositoryId: '42',
      fullPath: 'team/repo',
      workflowId: 'work-1',
      id: '1',
      number: '1',
      url: 'https://github.com/team/repo/pull/1',
    },
  ],
};
const data = (): ProjectPlannerData => ({
  version: 1,
  projects: [{ id: 'project-1', name: 'Example', description: '', kind: 'repository', repoPath: '/local/repo', createdAt: 1, updatedAt: 1 }],
  items: [
    {
      id: 'item-1',
      projectId: 'project-1',
      title: 'Work',
      description: '',
      priority: 'medium',
      status: 'planned',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      references: structuredClone(reference),
    },
  ],
});

describe('portable planner references', () => {
  it('roundtrips version-one files without runtime fields or absolute paths', () => {
    const source = data();
    Object.assign(source.items[0].references!.branches[0], { worktreePath: 'C:/secret', accountId: 'local', commits: ['cached'] });
    const normalized = normalizeProjectPlannerData(source);
    expect(normalized.items[0].references).toEqual(reference);
    const text = serializeRepositoryPlanningFile(normalized);
    expect(text).not.toContain('/local/repo');
    expect(text).not.toContain('C:/secret');
    expect(text).not.toContain('accountId');
    expect(
      parsePlannerData(text, 'Test planning', (value) => {
        const document = value as ProjectPlannerData;
        document.projects[0].repoPath = '/local/repo';
        return document;
      }).items[0].references,
    ).toEqual(reference);
  });
  it('keeps legacy tasks unlinked and preserves references during edits and project moves', () => {
    const source = data();
    const old = { ...source.items[0] };
    delete old.references;
    expect(normalizeProjectPlannerData({ ...source, items: [old] }).items[0]).not.toHaveProperty('references');
    updatePlannerItemInData(source, 'item-1', { title: 'Edited' });
    expect(source.items[0].references).toEqual(reference);
    source.projects.push({ ...source.projects[0], id: 'other' });
    updatePlannerItemInData(source, 'item-1', {}, { projectId: 'other' });
    expect(source.items[0].references).toEqual(reference);
    expect(activePlannerBranch(source.items[0])).toBeUndefined();
  });
  it('pauses automation for manual status changes, checks stale revisions and keeps clone references in the cloned project', () => {
    const source = data();
    updatePlannerItemInData(source, 'item-1', { status: 'blocked', expectedUpdatedAt: 1 });
    expect(activePlannerBranch(source.items[0])?.automationPaused).toBe(true);
    expect(() => updatePlannerItemInData(source, 'item-1', { title: 'Stale', expectedUpdatedAt: 1 })).toThrow('changed');
    const copy = renumberRepositoryPlannerData(source);
    expect(activePlannerBranch(copy.items[0])?.projectId).toBe(copy.projects[0].id);
  });
  it('rejects malformed workflow/PR identities and credential links without rewriting source', () => {
    expect(() => normalizePlannerReferences({ ...reference, activeWorkflowId: 'missing' })).toThrow('Unknown active');
    expect(() => normalizePlannerReferences({ ...reference, branches: [reference.branches[0], reference.branches[0]] })).toThrow('Duplicate');
    expect(() => normalizePlannerReferences({ ...reference, pullRequests: [{ ...reference.pullRequests[0], url: 'https://secret@github.com/pr' }] })).toThrow(
      'Invalid change',
    );
    expect(() => normalizePlannerReferences({ ...reference, branches: [{ ...reference.branches[0], name: 'C:/local/path' }] })).toThrow('portable');
  });
});
