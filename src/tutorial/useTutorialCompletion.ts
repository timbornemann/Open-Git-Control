import { useEffect, useState } from 'react';
import type { TutorialStep, TutorialCompletion } from '@/shared/tutorial/types';
import type { DemoRepository } from './demoRepository';
import { resolveTutorialFileContent } from './demoContent';
import { readTutorialControl, readTutorialSelection } from './setTutorialControl';
import { readDemoBlob, isDemoGitlink } from './demoBlob';
import { matchesTutorialWorkingTree } from './matchesTutorialWorkingTree';
import { matchesJsonExerciseValue } from '@/shared/tutorial/jsonExerciseValue';
import { TUTORIAL_FEEDBACK_EVENT, type TutorialFeedback } from '@/shared/tutorial/feedback';
type FeedbackAttempts = Map<string, Map<Element, string | null>>;
const toastSelector = '.action-toast .toast-msg';
const matchesFeedback = (
  condition: Extract<TutorialCompletion, { kind: 'feedback' }>,
  attempts: FeedbackAttempts,
  receipts: Set<string>,
  language: 'de' | 'en',
) =>
  receipts.has(condition.trigger) ||
  (attempts.has(condition.trigger) &&
    [...document.querySelectorAll(condition.error ? '.action-toast.error .toast-msg' : '.action-toast.success .toast-msg')].some(
      (toast) =>
        toast.textContent?.includes(resolveTutorialFileContent(condition.message, language)) &&
        (!attempts.get(condition.trigger)!.has(toast) || attempts.get(condition.trigger)!.get(toast) !== toast.textContent),
    ));

/** Completion is read from the real controls, after their React handlers run. */
export function useTutorialCompletion(step: TutorialStep, language: 'de' | 'en', ready: boolean, repo?: DemoRepository) {
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    setComplete(false);
    const rule = step.completion;
    const workspace = document.querySelector('.tutorial-workspace');
    if (!ready || !rule || !workspace) return;
    const seen = new Set<string>();
    const attempts: FeedbackAttempts = new Map();
    const receipts = new Set<string>();
    const feedbackRules = (condition: TutorialCompletion): Extract<TutorialCompletion, { kind: 'feedback' }>[] =>
      condition.kind === 'all' || condition.kind === 'any' ? condition.conditions.flatMap(feedbackRules) : condition.kind === 'feedback' ? [condition] : [];
    const feedback = feedbackRules(rule);
    const matches = (condition: TutorialCompletion): boolean => {
      if (condition.kind === 'all') return condition.conditions.map(matches).every(Boolean);
      if (condition.kind === 'any') return condition.conditions.map(matches).some(Boolean);
      if (condition.kind === 'feedback') return matchesFeedback(condition, attempts, receipts, language);
      if (condition.kind === 'clipboard') return repo?.clipboard === resolveTutorialFileContent(condition.value, language);
      if (condition.kind === 'file-format') {
        const blob = (condition.source === 'worktree' ? repo?.files : condition.source === 'index' ? repo?.indexFiles : repo?.headFiles)?.[condition.path];
        if (blob === undefined || isDemoGitlink(blob)) return false;
        const decoded = readDemoBlob(blob);
        return (
          decoded.encoding === condition.encoding &&
          (!condition.lineEnding || (condition.lineEnding === 'crlf' ? decoded.text?.includes('\r\n') : !decoded.text?.includes('\r')))
        );
      }
      if (condition.kind === 'working-tree') return matchesTutorialWorkingTree(repo, condition, language);
      const element = document.querySelector(condition.selector);
      if (condition.kind === 'absent') {
        if (element) seen.add(condition.selector);
        return seen.has(condition.selector) && !element;
      }
      if (condition.kind === 'element') return Boolean(element);
      if (condition.kind === 'selection') {
        const range = readTutorialSelection(element);
        return range?.from === condition.from && range.to === condition.to;
      }
      if (condition.kind === 'text') return element?.textContent === resolveTutorialFileContent(condition.value, language);
      const actual = readTutorialControl(element),
        expected = resolveTutorialFileContent(condition.value, language);
      return condition.comparison === 'json' ? matchesJsonExerciseValue(actual, expected) : actual === expected;
    };
    const check = () => setComplete(matches(rule));
    const clicked = (event: Event) => {
      for (const condition of feedback)
        if (event.target instanceof Element && event.target.closest(condition.trigger)) {
          receipts.delete(condition.trigger);
          attempts.set(condition.trigger, new Map([...document.querySelectorAll(toastSelector)].map((node) => [node, node.textContent])));
        }
      check();
    };
    const submitted = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.repeat && !event.isComposing) clicked(event);
    };
    const received = (event: Event) => {
      const detail: TutorialFeedback | undefined = (event as CustomEvent<TutorialFeedback>).detail;
      if (!detail || typeof detail.message !== 'string') return;
      for (const condition of feedback)
        if (
          attempts.has(condition.trigger) &&
          detail.isError === condition.error &&
          detail.message.includes(resolveTutorialFileContent(condition.message, language))
        )
          receipts.add(condition.trigger);
      check();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class',
        'open',
        'disabled',
        'aria-selected',
        'aria-checked',
        'aria-pressed',
        'aria-expanded',
        'data-tutorial-route',
        'data-dirty',
        'data-tab',
        'data-path',
        'data-source',
        'data-commit-hash',
        'data-commit-head',
        'data-conflict-dirty',
        'data-conflict-files',
        'data-conflict-blocks',
        'data-conflict-operation',
        'data-conflict-block-index',
        'data-conflict-file-index',
        'data-conflict-path',
        'data-history-hash',
        'data-blame-hash',
        'contenteditable',
        'data-encoding',
        'data-line-ending',
        'data-whitespace',
        'data-selection-from',
        'data-selection-to',
        'data-search-settled',
        'data-search-count',
        'data-search-files',
        'data-search-query',
        'data-search-scope',
        'data-search-mode',
        'data-search-path',
        'data-search-loading',
        'data-search-empty',
        'data-active',
        'data-selected',
      ],
    });
    document.addEventListener('input', check);
    document.addEventListener('change', check);
    document.addEventListener('selectionchange', check);
    document.addEventListener('click', clicked, true);
    document.addEventListener('keydown', submitted, true);
    window.addEventListener(TUTORIAL_FEEDBACK_EVENT, received);
    const stop = repo?.subscribe(check);
    check();
    return () => {
      observer.disconnect();
      document.removeEventListener('input', check);
      document.removeEventListener('change', check);
      document.removeEventListener('selectionchange', check);
      document.removeEventListener('click', clicked, true);
      document.removeEventListener('keydown', submitted, true);
      window.removeEventListener(TUTORIAL_FEEDBACK_EVENT, received);
      stop?.();
    };
  }, [step.id, step.completion, language, ready, repo]);
  return complete;
}
