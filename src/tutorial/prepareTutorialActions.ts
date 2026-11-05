import type { TutorialPreparationAction } from '@/shared/tutorial/types';
import { resolveTutorialFileContent } from './demoContent';
import { readTutorialControl, setTutorialControl } from './setTutorialControl';

/** Restore dependent dialogs in order, waiting for their actual controls. */
export function createTutorialActionRestorer(actions: readonly TutorialPreparationAction[] = [], language: 'de' | 'en', defer: (resume: () => void) => void) {
  let index = 0;
  let waiting = false;
  let expanding = -1;
  return () => {
    if (waiting) return false;
    while (index < actions.length) {
      const action = actions[index];
      if ('expand' in action || 'collapse' in action) {
        const expand = 'expand' in action;
        const control = document.querySelector<HTMLElement>('expand' in action ? action.expand : action.collapse);
        if (!control) return false;
        if (control.getAttribute('aria-expanded') !== String(expand)) {
          if (expanding !== index) {
            expanding = index;
            control.click();
          }
          return false;
        }
        expanding = -1;
        index++;
      } else if ('waitFor' in action) {
        if (!document.querySelector(action.waitFor)) return false;
        index++;
      } else if ('waitValue' in action) {
        if (readTutorialControl(document.querySelector(action.waitValue.selector)) !== resolveTutorialFileContent(action.waitValue.value, language))
          return false;
        index++;
      } else if ('fill' in action) {
        const control = document.querySelector(action.fill.selector);
        const value = resolveTutorialFileContent(action.fill.value, language);
        const changed = readTutorialControl(control) !== value;
        if (!setTutorialControl(control, value)) return false;
        index++;
        if (changed) {
          waiting = true;
          defer(() => {
            waiting = false;
          });
          return false;
        }
      } else if ('pressKey' in action) {
        const control = document.querySelector<HTMLElement>(action.pressKey.selector);
        if (!control || control.matches(':disabled')) return false;
        index++;
        control.focus();
        control.dispatchEvent(new KeyboardEvent('keydown', { key: action.pressKey.key, bubbles: true, cancelable: true }));
        control.dispatchEvent(new KeyboardEvent('keyup', { key: action.pressKey.key, bubbles: true, cancelable: true }));
        waiting = true;
        defer(() => {
          waiting = false;
        });
        return false;
      } else if ('contextMenu' in action) {
        const control = document.querySelector<HTMLElement>(action.contextMenu);
        if (!control) return false;
        const bounds = control.getBoundingClientRect();
        index++;
        control.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: bounds.left + Math.min(20, bounds.width / 2),
            clientY: bounds.top + bounds.height / 2,
          }),
        );
      } else {
        const control = document.querySelector<HTMLElement>(action.click);
        if (!control || (control instanceof HTMLButtonElement && control.disabled)) return false;
        index++;
        control.click();
        continue;
      }
    }
    return true;
  };
}
