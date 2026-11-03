// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { setActiveResourceRepository, resourceKey } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import { setIsolatedElectronApi } from '@/services/electronApi';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialHostApi, TutorialLaunchContext } from '@/shared/tutorial/types';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, ok } from './demoRepository';
import { resetTutorialUi } from './resetTutorialUi';

const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
};

afterEach(() => {
  delete window.tutorialHost;
  if (localStorageDescriptor) Object.defineProperty(window, 'localStorage', localStorageDescriptor);
  if (sessionStorageDescriptor) Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor);
});
it('preserves the prepared run config when the next checkpoint mounts with no selected repository', async () => {
  window.tutorialHost = {} as TutorialHostApi;
  // Node 25 exposes a placeholder Storage without a backing file. Use the
  // browser storage contract explicitly in this renderer integration fixture.
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memoryStorage() });
  setActiveResourceRepository(DEMO_REPO);
  resetTutorialUi();
  // This is the initial empty result published by useRepositoryRun on mount.
  queryClient.setQueryData(resourceKey('runs', 'getConfig', [null]), ok(null));
  const context: TutorialLaunchContext = {
    request: { chapterId: 'run' },
    language: 'de',
    theme: 'copper-night',
    progress: { version: 1, welcomeSeen: true, completedChapters: [] },
  };
  setIsolatedElectronApi(createDemoApi(context, TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'run')!.steps[0]).api);
  const result = await repositoryRunClient.getConfig(DEMO_REPO);
  expect(result.success && result.data?.availableActions.test).toBe(true);
});
