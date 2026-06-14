import { describe, expect, it } from 'vitest';
import {
  normalizeProjectPlannerData,
  validateProjectFolderName,
} from '../main-process/projectPlannerStore';

describe('projectPlannerStore', () => {
  it('normalizes projects and items while removing invalid references and duplicate tags', () => {
    const normalized = normalizeProjectPlannerData({
      version: 99,
      projects: [
        {
          id: 'planned-1',
          name: '  Future App  ',
          description: '  Some vision  ',
          kind: 'planned',
          repoPath: 'ignored',
          createdAt: 10,
          updatedAt: 20,
        },
      ],
      items: [
        {
          id: 'item-1',
          projectId: 'planned-1',
          title: '  Build prototype  ',
          description: '  Explore the UI  ',
          priority: 'urgent',
          status: 'in-progress',
          tags: ['UI', ' ui ', 'Feature', '', 42],
          createdAt: 30,
          updatedAt: 40,
        },
        {
          id: 'orphan',
          projectId: 'missing',
          title: 'Must be removed',
        },
      ],
    });

    expect(normalized.version).toBe(1);
    expect(normalized.projects).toEqual([
      expect.objectContaining({
        id: 'planned-1',
        name: 'Future App',
        description: 'Some vision',
        kind: 'planned',
        repoPath: null,
      }),
    ]);
    expect(normalized.items).toEqual([
      expect.objectContaining({
        id: 'item-1',
        title: 'Build prototype',
        description: 'Explore the UI',
        priority: 'urgent',
        status: 'in-progress',
        tags: ['UI', 'Feature'],
      }),
    ]);
  });

  it('uses safe defaults for unknown priority and status values', () => {
    const normalized = normalizeProjectPlannerData({
      projects: [{ id: 'p', name: 'Project', kind: 'planned' }],
      items: [{
        id: 'i',
        projectId: 'p',
        title: 'Item',
        priority: 'now',
        status: 'later',
      }],
    });

    expect(normalized.items[0]).toMatchObject({
      priority: 'medium',
      status: 'idea',
    });
  });

  it('validates portable project folder names', () => {
    expect(validateProjectFolderName('  my-project  ')).toBe('my-project');
    expect(() => validateProjectFolderName('../escape')).toThrow(/invalid characters/i);
    expect(() => validateProjectFolderName('CON')).toThrow(/reserved/i);
    expect(() => validateProjectFolderName('trailing.')).toThrow(/must not end/i);
  });
});
