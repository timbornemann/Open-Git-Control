import { getElectronApi } from '@/services/electronApi';
import type { TutorialLaunchRequest, TutorialProgressDto } from '@/shared/tutorial/types';

export const tutorialAvailable = () => typeof getElectronApi()?.app?.getTutorialProgress === 'function';
export const tutorialProgress = (): Promise<TutorialProgressDto> => {
  const api = getElectronApi()?.app;
  if (!api?.getTutorialProgress) return Promise.resolve({ version: 1, welcomeSeen: true, completedChapters: [] });
  return api.getTutorialProgress();
};
export async function launchTutorial(request: TutorialLaunchRequest): Promise<void> {
  const api = getElectronApi()?.app;
  if (!api?.startTutorial) throw new Error('The tutorial is available in the desktop application.');
  const result = await api.startTutorial(request);
  if (!result.success) throw new Error(result.error || 'The tutorial could not be opened.');
}
