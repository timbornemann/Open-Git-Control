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
const render = async (language: 'en' | 'de' = 'de', query = '') =>
  act(async () =>
    root.render(
      <I18nProvider language={language}>
        <SettingsTutorialSection query={query} />
      </I18nProvider>,
    ),
  );

it.each(['de', 'en'] as const)('lists every chapter with persisted completion in %s', async (language) => {
  await render(language);
  expect(container.querySelectorAll('article')).toHaveLength(TUTORIAL_CHAPTERS.length);
  expect(container.querySelectorAll('.tutorial-lesson-completed')).toHaveLength(1);
  expect(container.querySelectorAll('.tutorial-lesson-steps button')).toHaveLength(0);
  for (const chapter of TUTORIAL_CHAPTERS)
    expect(resolveTutorialRequest({ chapterId: chapter.id, stepId: TUTORIAL_QUESTION_STEPS[chapter.id] }).chapterId).toBe(chapter.id);
});
it('jumps directly from a question to its matching exercise and refreshes after returning', async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('[data-chapter="basics"] .tutorial-lesson-toggle')!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('.tutorial-lesson-question')!.click());
  expect(startTutorial).toHaveBeenCalledWith({ chapterId: 'basics', stepId: 'orientation' });
  completed = ['basics', 'hosting'];
  await act(async () => refresh?.());
  expect(container.querySelectorAll('.tutorial-lesson-completed')).toHaveLength(2);
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');
});
it('finds help by question keywords and full step text and shows an empty result', async () => {
  await render();
  await render('de', 'konflikt');
  const results = [...container.querySelectorAll('article')].map((article) => article.textContent);
  expect(results).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Konflikte: Inhalt wählen'),
      expect.stringContaining('Konfliktentscheidungen: Aktuell'),
      expect.stringContaining('Konflikteditor: eigenen Inhalt'),
      expect.stringContaining('Merge abbrechen: Folgen prüfen'),
    ]),
  );
  expect(container.querySelectorAll('.tutorial-lesson-steps button')).toHaveLength(0);
  const manual = container.querySelector('[data-chapter="conflicts-manual"]')!;
  await act(async () => manual.querySelector<HTMLButtonElement>('.tutorial-lesson-toggle')!.click());
  await act(async () => manual.querySelector<HTMLButtonElement>('.tutorial-lesson-question')!.click());
  expect(startTutorial).toHaveBeenLastCalledWith({ chapterId: 'conflicts-manual', stepId: 'write' });
  await render('de', 'no-such-help');
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(container.textContent).toContain('Keine passenden Lektionen');
});

it('filters by topic, keeps all sections reachable and recovers from a search with no results in the selected topic', async () => {
  await render('en');
  const topic = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('.tutorial-topic')].find((button) => button.querySelector('span')?.textContent === label)!;
  await act(async () => topic('Hosting').click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article')?.getAttribute('data-chapter')).toBe('hosting');
  await render('en', 'rebase');
  expect(container.querySelectorAll('article')).toHaveLength(0);
  const all = [...container.querySelectorAll<HTMLButtonElement>('.tutorial-catalog-empty button')].find(
    (button) => button.textContent === 'Search all topics',
  )!;
  await act(async () => all.click());
  expect(container.querySelectorAll('article').length).toBeGreaterThan(1);
  expect(topic('All lessons').getAttribute('aria-pressed')).toBe('true');
});

it('opens only one lesson at a time and starts an individual step or the whole lesson without changing its target', async () => {
  await render();
  const basics = container.querySelector('[data-chapter="basics"]')!;
  const commit = container.querySelector('[data-chapter="commit"]')!;
  await act(async () => basics.querySelector<HTMLButtonElement>('.tutorial-lesson-toggle')!.click());
  await act(async () => commit.querySelector<HTMLButtonElement>('.tutorial-lesson-toggle')!.click());
  expect(basics.querySelector('.tutorial-lesson-toggle')?.getAttribute('aria-expanded')).toBe('false');
  expect(basics.querySelectorAll('.tutorial-lesson-steps button')).toHaveLength(0);
  const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'commit')!.steps[1];
  await act(async () => commit.querySelectorAll<HTMLButtonElement>('.tutorial-lesson-steps button')[1].click());
  expect(startTutorial).toHaveBeenLastCalledWith({ chapterId: 'commit', stepId: step.id });
  await act(async () => commit.querySelector<HTMLButtonElement>('.tutorial-lesson-heading > .ui-button')!.click());
  expect(startTutorial).toHaveBeenLastCalledWith({ chapterId: 'commit' });
});

it('disables all lesson launch actions while opening and allows retry after an error', async () => {
  let finish!: (value: unknown) => void;
  startTutorial.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  const start = container.querySelector<HTMLButtonElement>('[data-chapter="basics"] .ui-button')!;
  await act(async () => {
    start.click();
    start.click();
  });
  expect(startTutorial).toHaveBeenCalledTimes(1);
  expect(container.querySelector<HTMLButtonElement>('[data-chapter="commit"] .ui-button')?.disabled).toBe(true);
  await act(async () => finish({ success: false, error: 'Cannot open' }));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('konnte nicht geöffnet werden');
  await act(async () => start.click());
  expect(startTutorial).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
