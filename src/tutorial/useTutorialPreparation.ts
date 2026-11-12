import { useEffect, useRef, useState } from 'react';
import type { TutorialStep } from '@/shared/tutorial/types';
import { resolveTutorialFileContent } from './demoContent';
import { setTutorialControl } from './setTutorialControl';
import { createTutorialSelectionRestorer } from './prepareTutorialSelection';
import { createTutorialActionRestorer } from './prepareTutorialActions';
import { tutorialObserverAttributes } from './tutorialObserverAttributes';

/** Restore a direct entry once; forward steps retain what the user actually did. */
export function useTutorialPreparation(step: TutorialStep, language: 'de' | 'en' = 'de') {
  const initial = useRef(step);
  const initialLanguage = useRef(language);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const current = initial.current;
    const workspace = document.querySelector('.tutorial-workspace');
    if (!workspace) return;
    const trigger =
      current.openView === 'recovery'
        ? '[data-tutorial="open-recovery"]'
        : current.openView === 'files'
          ? '[data-tutorial="open-files"]'
          : current.openView === 'diff'
            ? `${current.prepare?.diff ? `[data-tutorial="${current.prepare.diff.source}-files"]` : '[data-tutorial="staging"]'} .staging-file-row[aria-label=${JSON.stringify(current.prepare?.diff?.path || 'README.md')}]`
            : null;
    let opened = !trigger;
    let index = 0;
    let filled = 0;
    let submitted = false;
    let contextOpened = false;
    let after = 0;
    let frame: number | undefined;
    let parentMounted = false;
    let disposed = false;
    const restoreActions = createTutorialActionRestorer(current.prepare?.actions, initialLanguage.current, (resume) => {
      frame = requestAnimationFrame(() => {
        resume();
        prepare();
      });
    });
    const clicks = current.prepare?.click || [];
    const fields = current.prepare?.fill || [];
    const restoreSelection = createTutorialSelectionRestorer(current.prepare?.selection);
    const observer = new MutationObserver(prepare);
    const hasReadyControl = () => !current.prepare?.ready || Boolean(document.querySelector(current.prepare.ready));
    function prepare() {
      if (!parentMounted) return;
      if (!opened && current.openView === 'diff' && workspace!.querySelector('.file-viewer')) opened = true;
      if (!opened) {
        const control = workspace!.querySelector<HTMLElement>(trigger!);
        if (!control || (control instanceof HTMLButtonElement && control.disabled)) return;
        opened = true;
        control.click();
      }
      if (current.openView === 'diff' && !workspace!.querySelector('.file-viewer')) return;
      while (index < clicks.length) {
        const control = document.querySelector<HTMLElement>(clicks[index]);
        if (!control || (control instanceof HTMLButtonElement && control.disabled)) return;
        index++;
        control.click();
      }
      while (filled < fields.length) {
        const field = fields[filled];
        if (!setTutorialControl(document.querySelector(field.selector), resolveTutorialFileContent(field.value, initialLanguage.current))) return;
        filled++;
      }
      if (!restoreSelection()) return;
      if (current.prepare?.contextMenu && !contextOpened) {
        const control = document.querySelector<HTMLElement>(current.prepare.contextMenu);
        if (!control) return;
        const bounds = control.getBoundingClientRect();
        contextOpened = true;
        control.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: bounds.left + Math.min(20, bounds.width / 2),
            clientY: bounds.top + bounds.height / 2,
          }),
        );
      }
      if (current.prepare?.submit && !submitted) {
        const control = document.querySelector<HTMLButtonElement>(current.prepare.submit);
        if (!control || control.disabled) return;
        submitted = true;
        control.click();
      }
      while (after < (current.prepare?.after?.length || 0)) {
        const control = document.querySelector<HTMLButtonElement>(current.prepare!.after![after]);
        if (!control || control.disabled) return;
        after++;
        control.click();
      }
      if (!restoreActions() || !hasReadyControl()) return;
      setReady(true);
      observer.disconnect();
    }
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: tutorialObserverAttributes(
        [
          'disabled',
          'value',
          'src',
          'class',
          'open',
          'aria-busy',
          'aria-expanded',
          'aria-pressed',
          'data-tab',
          'data-source',
          'data-commit-hash',
          'data-commit-head',
          'data-conflict-dirty',
          'data-conflict-files',
          'data-conflict-blocks',
          'data-conflict-block-index',
          'data-conflict-file-index',
          'data-conflict-path',
          'data-history-hash',
          'data-blame-hash',
          'data-dirty',
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
          'data-entry-count',
          'data-recovery-hash',
        ],
        current.prepare,
      ),
    });
    // Parent mount effects establish responsive layout after child effects.
    // Restore controls afterwards so that initialization cannot undo a click.
    queueMicrotask(() => {
      if (disposed) return;
      parentMounted = true;
      prepare();
    });
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);
  return ready;
}
