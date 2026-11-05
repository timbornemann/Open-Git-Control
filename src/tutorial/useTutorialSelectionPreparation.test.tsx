// @vitest-environment jsdom
import { act, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, it, vi } from 'vitest';
import type { TutorialStep } from '@/shared/tutorial/types';
import { useTutorialPreparation } from './useTutorialPreparation';

it('waits for committed selection props before opening the next menu', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const createRange = document.createRange.bind(document);
  const geometry = vi
    .spyOn(document, 'createRange')
    .mockImplementation(() => Object.assign(createRange(), { getClientRects: () => [], getBoundingClientRect: () => new DOMRect() }));
  const container = document.createElement('div'),
    workspace = document.createElement('section');
  workspace.className = 'tutorial-workspace';
  document.body.append(container, workspace);
  const root = createRoot(container),
    clicked = vi.fn();
  const step: TutorialStep = {
    id: 'selection',
    title: ['', ''],
    description: ['', ''],
    area: 'repo',
    target: '.after-selection',
    prepare: { selection: { selector: '.cm-editor', from: 7, to: 11 }, after: ['.after-selection'] },
  };
  function Harness() {
    const host = useRef<HTMLDivElement>(null),
      [range, setRange] = useState({ from: 0, to: 0 });
    useLayoutEffect(() => {
      const view = new EditorView({
        parent: host.current!,
        state: EditorState.create({
          doc: 'before Café after\n',
          extensions: [
            EditorView.updateListener.of((update) => {
              if (update.selectionSet) setRange({ from: update.state.selection.main.from, to: update.state.selection.main.to });
            }),
          ],
        }),
      });
      return () => view.destroy();
    }, []);
    const ready = useTutorialPreparation(step);
    return (
      <>
        <output>{String(ready)}</output>
        {createPortal(
          <div className="file-viewer" data-selection-from={range.from} data-selection-to={range.to}>
            <div ref={host} />
            <button className="after-selection" onClick={() => clicked(range)}>
              Menu
            </button>
          </div>,
          workspace,
        )}
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(clicked).toHaveBeenCalledExactlyOnceWith({ from: 7, to: 11 });
    expect(container.textContent).toBe('true');
    await act(async () => workspace.setAttribute('data-other', 'later'));
    expect(clicked).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    workspace.remove();
    geometry.mockRestore();
    vi.unstubAllGlobals();
  }
});
