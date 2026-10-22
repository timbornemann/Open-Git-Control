// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorPosition } from '@/types/editor';
import { WorkingDirectoryCodeEditor } from './WorkingDirectoryCodeEditor';
import { updateResource } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';

let host: HTMLDivElement, root: Root;
const change = vi.fn();
const render = (position: EditorPosition, value = 'first\nsecond\nthird') =>
  act(async () => root.render(<WorkingDirectoryCodeEditor path="notes.txt" value={value} position={position} onChange={change} onSave={vi.fn()} />));
const view = () => EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  change.mockReset();
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() =>
    Object.assign(createRange(), {
      getClientRects: () => [] as unknown as DOMRectList,
      getBoundingClientRect: () => new DOMRect(),
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe('working-file editor run navigation', () => {
  it('changes and disables save shortcuts without recreating the editor or losing its text and selection', async () => {
    const save = vi.fn();
    await act(async () => root.render(<WorkingDirectoryCodeEditor path="notes.txt" value="unsaved text" onChange={change} onSave={save} />));
    const original = view();
    act(() => original.dispatch({ selection: { anchor: 4 } }));
    const press = (key: string, extras = {}) =>
      act(() => original.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...extras })));
    const windowSave = vi.fn();
    const listener = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === 's') windowSave();
    };
    window.addEventListener('keydown', listener);
    try {
      press('s');
      expect(save).toHaveBeenCalledOnce();
      expect(windowSave).not.toHaveBeenCalled();
      await act(async () =>
        updateResource(resourceKey('app', 'getSettings'), {
          ...DEFAULT_SETTINGS,
          keyboardShortcuts: { saveFile: { key: 'F8', primary: false, alt: false, shift: false } },
        }),
      );
      press('s');
      expect(save).toHaveBeenCalledOnce();
      press('F8', { ctrlKey: false });
      expect(save).toHaveBeenCalledTimes(2);
      press('F8', { ctrlKey: false, repeat: true });
      expect(save).toHaveBeenCalledTimes(2);
      expect(view()).toBe(original);
      expect(original.state.doc.toString()).toBe('unsaved text');
      expect(original.state.selection.main.head).toBe(4);
      await act(async () => updateResource(resourceKey('app', 'getSettings'), { ...DEFAULT_SETTINGS, keyboardShortcuts: { saveFile: null } }));
      press('F8', { ctrlKey: false });
      press('s');
      expect(save).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });
  it('focuses the requested one-based line and column without changing the file', async () => {
    await render({ line: 2, column: 3 });
    expect(view().state.selection.main.head).toBe(8);
    expect(view().hasFocus).toBe(true);
    expect(change).not.toHaveBeenCalled();
    expect(view().state.doc.toString()).toBe('first\nsecond\nthird');
    await render({ line: 3 });
    expect(view().state.selection.main.head).toBe(13);
  });
  it('clamps obsolete diagnostic locations to the current file and keeps the cursor through repeat renders', async () => {
    const position = { line: 100, column: 100 };
    await render(position);
    expect(view().state.selection.main.head).toBe(18);
    await act(async () => view().dispatch({ selection: { anchor: 1 } }));
    await render(position);
    expect(view().state.selection.main.head).toBe(1);
    await render({ line: -1, column: -2 });
    expect(view().state.selection.main.head).toBe(0);
  });
});
