import { describe, expect, it } from 'vitest';
import { TUTORIAL_CHAPTERS, resolveTutorialRequest } from './catalog';
import { tutorialSearchStep, tutorialSearchText, tutorialSection } from './curriculum';
import { TUTORIAL_QUESTION_STEPS } from './catalogSteps';

describe('the tutorial learning path', () => {
  it('starts with an overview of every actual activity-bar area, without Git mutations', () => {
    const overview = TUTORIAL_CHAPTERS[0];
    expect(overview.id).toBe('basics');
    expect(tutorialSection(overview)).toBe('overview');
    expect(overview.steps.filter((step) => step.action).map((step) => step.action)).toEqual([
      'navigate:repo',
      'navigate:analytics',
      'navigate:planner',
      'navigate:localRepos',
      'navigate:hosting',
      'navigate:settings',
    ]);
    for (const step of overview.steps.filter((step) => step.action)) {
      const explanation = overview.steps[overview.steps.indexOf(step) + 1];
      expect(explanation.area).toBe(step.action!.slice(9));
      expect(explanation.action).toBeUndefined();
      expect(explanation.description.every((text) => text.length > 100)).toBe(true);
    }
  });
  it('has individually addressable detail steps for every commit field', () => {
    const commit = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'commit')!;
    expect(commit.steps.length).toBeGreaterThanOrEqual(14);
    for (const id of ['type', 'prefix', 'message', 'description', 'signoff']) {
      const step = commit.steps.find((entry) => entry.id === id)!;
      expect(step.completion?.kind).toBe('value');
      expect(step.prepare?.commit).toBeDefined();
      expect(resolveTutorialRequest({ chapterId: 'commit', stepId: id })).toEqual({ chapterId: 'commit', stepId: id });
    }
    expect(commit.steps.find((entry) => entry.id === 'commit')?.action).toBe('committed');
  });
  it('keeps IDs unique and every help destination valid', () => {
    expect(new Set(TUTORIAL_CHAPTERS.map((chapter) => chapter.id)).size).toBe(TUTORIAL_CHAPTERS.length);
    for (const chapter of TUTORIAL_CHAPTERS) {
      expect(new Set(chapter.steps.map((step) => step.id)).size).toBe(chapter.steps.length);
      expect(() => resolveTutorialRequest({ chapterId: chapter.id, stepId: TUTORIAL_QUESTION_STEPS[chapter.id] })).not.toThrow();
    }
  });
  it('finds individual explanations through full lesson text', () => {
    const commit = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'commit')!;
    expect(tutorialSearchText(commit)).toContain('kryptografisch');
    expect(tutorialSearchStep(commit, 'Beschreibung')).toBe('description-explained');
  });
});
