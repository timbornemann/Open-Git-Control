// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTutorialViewCompletion } from './useTutorialViewCompletion';

describe('tutorial view exercises', () => {
  let root: Root;
  let container: HTMLDivElement;
  let workspace: HTMLDivElement;
  function Harness({ action }: { action: string }) {
    const complete = useTutorialViewCompletion(action);
    return <output>{String(complete)}</output>;
  }
  const render = (action = 'diff-closed') => act(() => root.render(<Harness action={action} />));
  const view = async (content: string) =>
    act(async () => {
      workspace.innerHTML = content;
    });
  const complete = () => container.textContent === 'true';
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    workspace = document.createElement('div');
    workspace.className = 'tutorial-workspace';
    workspace.innerHTML = '<main data-tutorial-route="graph"></main>';
    document.body.append(container, workspace);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    workspace.remove();
    vi.unstubAllGlobals();
  });

  it('does not count the initial loading state as a closed diff', () => {
    render();
    expect(complete()).toBe(false);
  });

  it('completes only after an opened viewer has been closed back to the workspace', async () => {
    render();
    await view('<main data-tutorial-route="diff"><div class="file-viewer"></div></main>');
    expect(complete()).toBe(false);
    await view('<main data-tutorial-route="graph"></main>');
    expect(complete()).toBe(true);
    await view('<main data-tutorial-route="diff"><div class="file-viewer"></div></main>');
    expect(complete()).toBe(false);
  });

  it('does not count navigating away to settings as closing the diff', async () => {
    await view('<main data-tutorial-route="diff"><div class="file-viewer"></div></main>');
    render();
    await view('<main data-tutorial-route="settings"></main>');
    expect(complete()).toBe(false);
  });

  it('starts a repeated checkpoint with a fresh opening requirement', async () => {
    render();
    await view('<main data-tutorial-route="diff"><div class="file-viewer"></div></main>');
    await view('<main data-tutorial-route="graph"></main>');
    expect(complete()).toBe(true);
    act(() => root.render(null));
    render();
    expect(complete()).toBe(false);
  });

  it('keeps existing diff inspection exercises state based, including selection changes', async () => {
    render('inspect:diff');
    expect(complete()).toBe(false);
    await view('<div class="working-tree-inspector has-selection"></div>');
    expect(complete()).toBe(true);
    await act(async () => {
      workspace.firstElementChild!.className = 'working-tree-inspector';
    });
    expect(complete()).toBe(false);
    await view('<main data-tutorial-route="file"></main>');
    expect(complete()).toBe(true);
  });

  it('preserves recovery inspection and resets completion when the exercise changes', async () => {
    render('inspect:recovery');
    await view('<main data-tutorial-route="recovery"></main>');
    expect(complete()).toBe(true);
    render();
    await view('<main data-tutorial-route="graph"></main>');
    expect(complete()).toBe(false);
  });
});
