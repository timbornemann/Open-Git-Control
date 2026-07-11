import { describe, expect, it } from 'vitest';
import { buildPlannerAgentPrompt, buildPlannerCommitNotes, resolvePlannerPromptLanguage } from '@/utils/plannerAiPrompts';

const project = {
  id: 'project-1',
  name: 'Open Git Control',
  description: 'Desktop Git client.',
  kind: 'repository' as const,
  repoPath: 'C:/Repos/Open-Git-Control',
  createdAt: 1,
  updatedAt: 1,
};

const item = {
  title: 'Fix copy detection',
  description: 'Support copied paths in the file timeline parser.',
  priority: 'high' as const,
  status: 'bug' as const,
  tags: ['history', 'git'],
};

describe('planner AI prompts', () => {
  it('builds an English bug-fix prompt with project and item context', () => {
    const prompt = buildPlannerAgentPrompt({ project, items: [item], language: 'en' });

    expect(prompt).toContain('You are a coding agent.');
    expect(prompt).toContain('Repository: C:/Repos/Open-Git-Control');
    expect(prompt).toContain('Title: Fix copy detection');
    expect(prompt).toContain('Reproduce or analyze the root cause');
    expect(prompt).toContain('Tags: history, git');
  });

  it('uses German status guidance when configured', () => {
    const prompt = buildPlannerAgentPrompt({ project, items: [{ ...item, status: 'done' }], language: 'de' });

    expect(prompt).toContain('Du bist ein Coding-Agent.');
    expect(prompt).toContain('Erledigt');
    expect(prompt).toContain('Pruefe die bisherige Umsetzung gegen den Arbeitsauftrag');
  });

  it.each([
    ['idea', 'Turn the idea into a suitable'],
    ['planned', 'Implement the planned change completely'],
    ['in-progress', 'Review the current in-progress state'],
    ['blocked', 'Investigate and resolve the blocker'],
    ['done', 'Verify the existing implementation'],
  ] as const)('includes status-specific guidance for %s', (status, expectedInstruction) => {
    const prompt = buildPlannerAgentPrompt({ project, items: [{ ...item, status }], language: 'en' });

    expect(prompt).toContain(expectedInstruction);
  });

  it('keeps all supplied visible items in a bulk prompt and commit notes', () => {
    const secondItem = { ...item, title: 'Add planner prompts', status: 'planned' as const, tags: [] };
    const prompt = buildPlannerAgentPrompt({ project, items: [item, secondItem], language: 'en' });
    const notes = buildPlannerCommitNotes({ project, items: [item, secondItem], language: 'en' });

    expect(prompt).toContain('1. Title: Fix copy detection');
    expect(prompt).toContain('2. Title: Add planner prompts');
    expect(notes).toContain('1. Title: Fix copy detection');
    expect(notes).toContain('2. Title: Add planner prompts');
  });

  it('uses English prompt templates for the automatic AI language', () => {
    expect(resolvePlannerPromptLanguage('auto')).toBe('en');
  });
});
