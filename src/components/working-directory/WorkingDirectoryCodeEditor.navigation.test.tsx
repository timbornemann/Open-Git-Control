// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorPosition } from '@/types/editor';
import { WorkingDirectoryCodeEditor } from './WorkingDirectoryCodeEditor';

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
