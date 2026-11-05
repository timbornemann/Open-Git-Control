import type { TutorialEditorSelection } from '@/shared/tutorial/types';
import { setTutorialSelection } from './setTutorialControl';

/** Wait for the FileViewer handler to receive the restored CodeMirror range. */
export function createTutorialSelectionRestorer(selection?: TutorialEditorSelection) {
  let selected = false;
  return () => {
    if (!selection) return true;
    const { selector, from, to } = selection;
    const control = document.querySelector(selector);
    if (!selected) {
      if (!setTutorialSelection(control, from, to)) return false;
      selected = true;
    }
    const viewer = control?.closest<HTMLElement>('.file-viewer');
    return !viewer || (viewer.dataset.selectionFrom === String(from) && viewer.dataset.selectionTo === String(to));
  };
}
