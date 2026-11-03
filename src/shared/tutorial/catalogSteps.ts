import type { TutorialStep } from './types';

export const step = (
  id: string,
  title: TutorialStep['title'],
  description: TutorialStep['description'],
  area: TutorialStep['area'],
  target: string,
  extra: Partial<TutorialStep> = {},
): TutorialStep => ({ id, title, description, area, target, ...extra });
export const nav = (area: string) => `[data-tutorial="nav-${area}"]`;

export const TUTORIAL_QUESTION_STEPS: Readonly<Record<string, string>> = {
  basics: 'commit',
  repositories: 'open',
  history: 'diff',
  branches: 'create',
  conflicts: 'resolve',
  recovery: 'find',
  planning: 'create',
  hosting: 'repositories',
  analytics: 'filters',
  run: 'start',
  ai: 'message',
  settings: 'general',
};
