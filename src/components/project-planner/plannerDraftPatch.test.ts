import { describe, expect, it } from 'vitest';
import { plannerDraftPatch } from './plannerDraftPatch';
import type { PlannerItem } from '@/types/projectPlanner';
const original: PlannerItem = {
  id: 'task',
  projectId: 'project',
  title: 'Title',
  description: 'Body',
  tags: ['Bug'],
  status: 'planned',
  priority: 'medium',
  createdAt: 1,
  updatedAt: 1,
};
describe('planner draft reconciliation', () => {
  it('preserves newer status/references while saving edited content with a revision guard', () => {
    expect(plannerDraftPatch(original, { ...original, status: 'in-progress', updatedAt: 2 }, { ...original, title: 'My edit' })).toEqual({
      title: 'My edit',
      expectedUpdatedAt: 2,
    });
  });
  it('requires reconciliation when the same field changed on both sides', () => {
    expect(() => plannerDraftPatch(original, { ...original, title: 'External edit' }, { ...original, title: 'My edit' })).toThrow('conflict');
    expect(plannerDraftPatch(original, { ...original, title: 'My edit', updatedAt: 2 }, { ...original, title: 'My edit' })).toEqual({
      title: 'My edit',
      expectedUpdatedAt: 2,
    });
  });
});
