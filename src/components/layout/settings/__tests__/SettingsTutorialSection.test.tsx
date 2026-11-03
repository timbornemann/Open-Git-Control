// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import * as bridge from '@/services/electronApi';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { SettingsTutorialSection } from '../SettingsTutorialSection';
import { TUTORIAL_CHAPTERS, resolveTutorialRequest } from '@/shared/tutorial/catalog';
import { TUTORIAL_QUESTION_STEPS } from '@/shared/tutorial/catalogSteps';

let root: Root, container: HTMLDivElement;
const startTutorial = vi.fn();
let refresh: (() => void) | undefined;
let completed: string[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  completed = ['basics'];
  startTutorial.mockReset().mockResolvedValue({ success: true });
  vi.spyOn(bridge, 'getElectronApi').mockReturnValue({
    app: {
      getTutorialProgress: async () => ({ version: 1, welcomeSeen: true, completedChapters: completed }),
      startTutorial,
      onTutorialClosed: (callback: () => void) => {
        refresh = callback;
        return () => {
          refresh = undefined;
        };
      },
    },
  } as unknown as ElectronAPI);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async (language: 'en' | 'de' = 'de') =>
  act(async () =>
    root.render(
      <I18nProvider language={language}>
        <SettingsTutorialSection />
      </I18nProvider>,
    ),
  );

it.each(['de', 'en'] as const)('lists every chapter with persisted completion in %s', async (language) => {
  await render(language);
  expect(container.querySelectorAll('article')).toHaveLength(TUTORIAL_CHAPTERS.length);
  expect(container.querySelectorAll('.tutorial-help-completed')).toHaveLength(1);
  for (const chapter of TUTORIAL_CHAPTERS)
    expect(resolveTutorialRequest({ chapterId: chapter.id, stepId: TUTORIAL_QUESTION_STEPS[chapter.id] }).chapterId).toBe(chapter.id);
});
it('jumps directly from a question to its matching exercise and refreshes after returning', async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('.tutorial-help-question')!.click());
  expect(startTutorial).toHaveBeenCalledWith({ chapterId: 'basics', stepId: 'commit' });
  completed = ['basics', 'hosting'];
  await act(async () => refresh?.());
  expect(container.querySelectorAll('.tutorial-help-completed')).toHaveLength(2);
});
it('finds help by question keywords and shows an empty result', async () => {
  await render();
  const input = container.querySelector('input')!;
  const search = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await search('konflikt');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article')!.textContent).toContain('Stash');
  await search('no-such-help');
  expect(container.querySelectorAll('article')).toHaveLength(0);
});
