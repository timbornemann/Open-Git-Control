import type { TutorialArea, TutorialChapter, TutorialText } from './types';
import { TUTORIAL_QUESTION_STEPS } from './catalogSteps';

export const TUTORIAL_SECTIONS: readonly { id: TutorialArea | 'overview'; title: TutorialText }[] = [
  { id: 'overview', title: ['Zuerst orientieren', 'Start with an overview'] },
  { id: 'repo', title: ['Aktuelles Repository: Git, Dateien und Ausführen', 'Current repository: Git, files and running commands'] },
  { id: 'localRepos', title: ['Lokale Repositories', 'Local repositories'] },
  { id: 'planner', title: ['Projektplanung', 'Project planning'] },
  { id: 'hosting', title: ['Hosting', 'Hosting'] },
  { id: 'analytics', title: ['Statistik & Analyse', 'Statistics & analytics'] },
  { id: 'settings', title: ['Einstellungen, KI und Schnittstellen', 'Settings, AI and interfaces'] },
];
const legacySections: Record<string, TutorialArea> = {
  repositories: 'localRepos',
  planning: 'planner',
  hosting: 'hosting',
  analytics: 'analytics',
  ai: 'settings',
  settings: 'settings',
};
export const tutorialSection = (chapter: TutorialChapter) => chapter.section || legacySections[chapter.id] || 'repo';
export const tutorialSearchText = (chapter: TutorialChapter) =>
  [chapter.title, chapter.description, chapter.question, chapter.keywords, ...chapter.steps.flatMap((step) => [step.title, step.description])]
    .flat()
    .join(' ')
    .toLocaleLowerCase();
export function tutorialSearchStep(chapter: TutorialChapter, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (
    (terms.length
      ? chapter.steps.find((step) => terms.every((term) => step.title.join(' ').toLocaleLowerCase().includes(term))) ||
        chapter.steps.find((step) => terms.every((term) => `${step.title.join(' ')} ${step.description.join(' ')}`.toLocaleLowerCase().includes(term)))
      : undefined
    )?.id || TUTORIAL_QUESTION_STEPS[chapter.id]
  );
}
