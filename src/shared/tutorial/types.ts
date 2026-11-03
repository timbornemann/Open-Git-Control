import type { AppSettingsDto } from '../../types/appDtos';

export type TutorialText = readonly [de: string, en: string];
export type TutorialArea = 'repo' | 'localRepos' | 'planner' | 'hosting' | 'analytics' | 'settings';
export type TutorialStep = {
  id: string;
  title: TutorialText;
  description: TutorialText;
  target: string;
  area: TutorialArea;
  settingsTab?: 'general' | 'shortcuts' | 'integrations' | 'api' | 'security' | 'system' | 'help';
  scenario?: 'staged' | 'clean' | 'conflict' | 'stash';
  action?: string;
  openView?: 'recovery' | 'files' | 'runConfig' | 'diff';
};
export type TutorialChapter = {
  id: string;
  title: TutorialText;
  description: TutorialText;
  question: TutorialText;
  keywords: string;
  steps: readonly TutorialStep[];
};
export type TutorialLaunchRequest = { chapterId: string; stepId?: string };
export type TutorialProgressDto = { version: 1; welcomeSeen: boolean; completedChapters: string[] };
export type TutorialLaunchContext = {
  request: TutorialLaunchRequest;
  language: AppSettingsDto['language'];
  theme: AppSettingsDto['theme'];
  progress: TutorialProgressDto;
};
export interface TutorialControlApi {
  getTutorialProgress: () => Promise<TutorialProgressDto>;
  acknowledgeTutorialWelcome: () => Promise<TutorialProgressDto>;
  startTutorial: (request: TutorialLaunchRequest) => Promise<{ success: boolean; error?: string }>;
  onTutorialClosed: (callback: (failed: boolean) => void) => () => void;
}
/** The tutorial preload deliberately exposes no repository or credential API. */
export interface TutorialHostApi {
  getContext: () => Promise<TutorialLaunchContext>;
  completeChapter: (chapterId: string) => Promise<TutorialProgressDto>;
  close: (failed?: boolean) => Promise<void>;
  ready: () => Promise<void>;
}

export const tutorialText = (value: TutorialText, language: 'de' | 'en') => value[language === 'de' ? 0 : 1];

export const TUTORIAL_CHANNELS = {
  progress: 'tutorial:progress',
  acknowledge: 'tutorial:acknowledge',
  start: 'tutorial:start',
  context: 'tutorial:context',
  complete: 'tutorial:complete',
  close: 'tutorial:close',
  ready: 'tutorial:ready',
} as const;
