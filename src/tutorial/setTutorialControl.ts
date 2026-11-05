import { EditorView } from '@codemirror/view';

function editorView(control: Element | null) {
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return null;
  const element = control?.matches('.cm-editor') ? control : control?.closest('.cm-editor') || control?.querySelector('.cm-editor');
  return element instanceof HTMLElement ? EditorView.findFromDOM(element) : null;
}
export function readTutorialControl(control: Element | null): string | undefined {
  if (control instanceof HTMLInputElement) return control.type === 'checkbox' ? String(control.checked) : control.value;
  if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return control.value;
  return editorView(control)?.state.doc.toString();
}
export function readTutorialSelection(control: Element | null) {
  const range = editorView(control)?.state.selection.main;
  return range ? { from: range.from, to: range.to } : null;
}
export function setTutorialSelection(control: Element | null, from: number, to: number) {
  const view = editorView(control);
  if (!view || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > view.state.doc.length) return false;
  const range = view.state.selection.main;
  if (range.from !== from || range.to !== to) view.dispatch({ selection: { anchor: from, head: to } });
  return true;
}

/** Restore through the same DOM events as user input, including controlled React fields. */
export function setTutorialControl(control: Element | null, value: string): boolean {
  const view = editorView(control);
  if (view) {
    if (view.state.readOnly) return false;
    if (view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    return true;
  }
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || control.disabled)
    return false;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    if (control.checked !== (value === 'true')) control.click();
    return true;
  }
  if (control instanceof HTMLSelectElement && ![...control.options].some((option) => option.value === value)) return false;
  const prototype =
    control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  return true;
}
