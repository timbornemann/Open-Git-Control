import { step } from './catalogSteps';
import type { TutorialStep, TutorialText, TutorialRepositoriesSetup } from './types';
export const repoControl = (name: string) => `[data-tutorial="repo-${name}"]`;
export const repoRow = (name = 'OGC-Lernprojekt') => `.local-repositories-view__row[data-repository-activity-path="/tutorial/${name}"]`;
export const repoMenu = `${repoRow()} ${repoControl('menu')}`;
export const dialogField = (name: string) => `[data-dialog-field="${name}"]`;
export const lessonValue = (selector: string, value: TutorialText) => ({ kind: 'value' as const, selector, value });
export const lessonElement = (selector: string) => ({ kind: 'element' as const, selector });
export const recipe = (
  repositories: TutorialRepositoriesSetup = {},
  click: readonly string[] = [],
  fill: readonly { selector: string; value: TutorialText }[] = [],
) => ({ repositories, click, fill });
export const repoStep = (id: string, title: TutorialText, text: TutorialText, target = '.local-repositories-view', extra: Partial<TutorialStep> = {}) =>
  step(id, title, text, 'localRepos', target, { scenario: 'clean', continue: true, ...extra });
