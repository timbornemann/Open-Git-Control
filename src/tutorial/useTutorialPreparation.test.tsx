// @vitest-environment jsdom
import { act, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TutorialStep } from '@/shared/tutorial/types';
import { useTutorialPreparation } from './useTutorialPreparation';

let root: Root, container: HTMLDivElement, workspace: HTMLDivElement;
const step: TutorialStep = { id: 'diff', title: ['', ''], description: ['', ''], area: 'repo', target: '.file-viewer', openView: 'diff' };
function Harness({ current = step }: { current?: TutorialStep }) {
  return <output>{String(useTutorialPreparation(current))}</output>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  workspace = document.createElement('div');
  workspace.className = 'tutorial-workspace';
  document.body.append(container, workspace);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  workspace.remove();
  vi.unstubAllGlobals();
});

it.each(['aria-pressed', 'data-commit-head'])('waits for an existing control whose %s state changes without replacing DOM nodes', async (attribute) => {
  workspace.innerHTML = `<button class="state-target" ${attribute}="false"></button>`;
  const control = workspace.querySelector('button')!;
  await act(async () => root.render(<Harness current={{ ...step, openView: undefined, prepare: { ready: `.state-target[${attribute}="true"]` } }} />));
  expect(container.textContent).toBe('false');
  await act(async () => control.setAttribute(attribute, 'true'));
  expect(container.textContent).toBe('true');
});

it('waits for the requested search snapshot even when no result nodes need to change', async () => {
  workspace.innerHTML = '<div class="working-search" data-search-settled="false" data-search-count="0"></div>';
  const search = workspace.querySelector<HTMLElement>('.working-search')!;
  act(() =>
    root.render(
      <Harness current={{ ...step, openView: undefined, prepare: { ready: '.working-search[data-search-settled="true"][data-search-count="0"]' } }} />,
    ),
  );
  expect(container.textContent).toBe('false');
  await act(async () => {
    search.dataset.searchSettled = 'true';
  });
  expect(container.textContent).toBe('true');
});

it('opens the sample only once after the real row appears and waits for the viewer', async () => {
  act(() => root.render(<Harness />));
  expect(container.textContent).toBe('false');
  const clicked = vi.fn(() => {
    const viewer = document.createElement('div');
    viewer.className = 'file-viewer';
    workspace.append(viewer);
  });
  await act(async () => {
    workspace.innerHTML = '<div data-tutorial="staging"><button class="staging-file-row" aria-label="README.md"></button></div>';
    workspace.querySelector('button')!.addEventListener('click', clicked);
  });
  expect(clicked).toHaveBeenCalledOnce();
  expect(container.textContent).toBe('true');
  await act(async () => {
    workspace.querySelector('.file-viewer')!.remove();
  });
  expect(clicked).toHaveBeenCalledOnce();
});
it('does not replay a restoration recipe when moving forward within the same mounted lesson', async () => {
  const clicked = vi.fn();
  workspace.innerHTML = '<button class="prepare-action"></button>';
  workspace.querySelector('button')!.addEventListener('click', clicked);
  await act(async () => root.render(<Harness current={{ ...step, openView: undefined, prepare: { click: ['.prepare-action'] } }} />));
  expect(clicked).toHaveBeenCalledOnce();
  await act(async () => root.render(<Harness current={{ ...step, id: 'following', openView: undefined, prepare: { click: ['.prepare-action'] } }} />));
  expect(clicked).toHaveBeenCalledOnce();
});
it('restores conditional controlled fields and a follow-up picker outside the workspace', async () => {
  const submitted = vi.fn();
  const current: TutorialStep = {
    ...step,
    openView: undefined,
    prepare: {
      click: ['.open-form'],
      fill: [
        { selector: 'select', value: ['gnu', 'gnu'] },
        { selector: '.holder', value: ['Alex', 'Alex'] },
      ],
      submit: '.submit-form',
      after: ['.choose-path', '.confirm-path'],
      ready: '.finished',
    },
  };
  function Form() {
    const [stage, setStage] = useState(0);
    const [license, setLicense] = useState('none');
    const [holder, setHolder] = useState('');
    const [selected, setSelected] = useState(false);
    const ready = useTutorialPreparation(current);
    return (
      <>
        <output>{String(ready)}</output>
        <button className="open-form" onClick={() => setStage(1)}>
          Open
        </button>
        {createPortal(
          stage === 1 ? (
            <div>
              <select value={license} onChange={(event) => setLicense(event.target.value)}>
                <option value="none">None</option>
                <option value="gnu">GNU</option>
              </select>
              {license === 'gnu' && <input className="holder" value={holder} onChange={(event) => setHolder(event.target.value)} />}
              <button
                className="submit-form"
                disabled={!holder}
                onClick={() => {
                  submitted(license, holder);
                  setStage(2);
                }}
              >
                Submit
              </button>
            </div>
          ) : stage === 2 ? (
            <div>
              <button className="choose-path" onClick={() => setSelected(true)}>
                Select
              </button>
              <button className="confirm-path" disabled={!selected} onClick={() => setStage(3)}>
                Confirm
              </button>
            </div>
          ) : stage === 3 ? (
            <div className="finished" />
          ) : null,
          document.body,
        )}
      </>
    );
  }
  await act(async () => root.render(<Form />));
  expect(container.querySelector('output')!.textContent).toBe('true');
  expect(submitted).toHaveBeenCalledExactlyOnceWith('gnu', 'Alex');
  expect(document.querySelector('.finished')).not.toBeNull();
});

it('opens a real context-menu event once and waits for its restored menu', async () => {
  workspace.innerHTML = '<div class="file-row" tabindex="0"></div>';
  const opened = vi.fn((event: Event) => {
    event.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'restored-menu';
    workspace.append(menu);
  });
  workspace.querySelector('.file-row')!.addEventListener('contextmenu', opened);
  await act(async () => root.render(<Harness current={{ ...step, openView: undefined, prepare: { contextMenu: '.file-row', ready: '.restored-menu' } }} />));
  expect(opened).toHaveBeenCalledOnce();
  expect(container.textContent).toBe('true');
  await act(async () => workspace.querySelector('.restored-menu')!.remove());
  expect(opened).toHaveBeenCalledOnce();
});
it('waits for the committed dirty state before opening an enabled close action', async () => {
  const closed = vi.fn();
  const current: TutorialStep = {
    ...step,
    openView: undefined,
    prepare: {
      fill: [{ selector: '.draft-field', value: ['Restored', 'Restored'] }],
      submit: '.draft-view[data-dirty="true"] .close-draft',
      ready: '.draft-confirmation',
    },
  };
  function Form() {
    const [value, setValue] = useState('Original');
    const [confirm, setConfirm] = useState(false);
    const ready = useTutorialPreparation(current);
    return (
      <>
        <output>{String(ready)}</output>
        <div className="draft-view" data-dirty={value !== 'Original'}>
          <input className="draft-field" value={value} onChange={(event) => setValue(event.target.value)} />
          <button
            className="close-draft"
            onClick={() => {
              closed(value);
              setConfirm(value !== 'Original');
            }}
          >
            Close
          </button>
        </div>
        {confirm && <div className="draft-confirmation" />}
      </>
    );
  }
  await act(async () => root.render(<Form />));
  expect(closed).toHaveBeenCalledExactlyOnceWith('Restored');
  expect(container.querySelector('output')?.textContent).toBe('true');
});
