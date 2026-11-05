// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readTutorialControl, setTutorialControl, readTutorialSelection, setTutorialSelection } from './setTutorialControl';

let host: HTMLDivElement, view: EditorView;
beforeEach(() => {
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() =>
    Object.assign(createRange(), { getClientRects: () => [], getBoundingClientRect: () => new DOMRect() }),
  );
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  view?.destroy();
  host.remove();
  vi.restoreAllMocks();
});

it('restores and reads the actual editor document through its change listener', () => {
  const changed = vi.fn();
  view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: 'Original\n',
      extensions: [
        EditorView.updateListener.of((update) => {
          if (update.docChanged) changed(update.state.doc.toString());
        }),
      ],
    }),
  });
  expect(setTutorialControl(host, 'Restored draft\n')).toBe(true);
  expect(changed).toHaveBeenCalledExactlyOnceWith('Restored draft\n');
  expect(readTutorialControl(host)).toBe('Restored draft\n');
  expect(setTutorialControl(host, 'Restored draft\n')).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
});
it('preserves a read-only editor and refuses restoration until it is editable', () => {
  view = new EditorView({ parent: host, state: EditorState.create({ doc: 'Commit\n', extensions: [EditorState.readOnly.of(true)] }) });
  expect(setTutorialControl(host, 'Changed\n')).toBe(false);
  expect(readTutorialControl(host)).toBe('Commit\n');
});
it('fills an editor search field without replacing the document', () => {
  view = new EditorView({ parent: host, state: EditorState.create({ doc: 'Original document\n' }) });
  const input = document.createElement('input');
  view.dom.append(input);
  expect(setTutorialControl(input, 'needle')).toBe(true);
  expect(input.value).toBe('needle');
  expect(readTutorialControl(host)).toBe('Original document\n');
});
it('restores a real selection without editing the document and accepts reverse user selection', () => {
  const changed = vi.fn();
  view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: 'before Café after\n',
      extensions: [
        EditorView.updateListener.of((update) => {
          if (update.selectionSet) changed(update.state.selection.main.from, update.state.selection.main.to);
        }),
      ],
    }),
  });
  expect(setTutorialSelection(host, 7, 11)).toBe(true);
  expect(readTutorialSelection(host)).toEqual({ from: 7, to: 11 });
  expect(readTutorialControl(host)).toBe('before Café after\n');
  expect(changed).toHaveBeenCalledExactlyOnceWith(7, 11);
  expect(setTutorialSelection(host, 7, 11)).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  view.dispatch({ selection: { anchor: 11, head: 7 } });
  expect(readTutorialSelection(host)).toEqual({ from: 7, to: 11 });
});
it('rejects invalid ranges and ordinary form fields without changing selection', () => {
  view = new EditorView({ parent: host, state: EditorState.create({ doc: 'Café' }) });
  for (const [from, to] of [
    [-1, 1],
    [1, 5],
    [3, 2],
    [0.5, 2],
    [NaN, 1],
  ])
    expect(setTutorialSelection(host, from, to)).toBe(false);
  const input = document.createElement('input');
  view.dom.append(input);
  expect(setTutorialSelection(input, 0, 1)).toBe(false);
  expect(readTutorialSelection(input)).toBeNull();
  expect(readTutorialSelection(host)).toEqual({ from: 0, to: 0 });
});
