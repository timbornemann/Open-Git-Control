// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useTutorialPreparation } from './useTutorialPreparation';
import type { TutorialStep } from '@/shared/tutorial/types';
import { createTutorialActionRestorer } from './prepareTutorialActions';

it('expands a delayed folder once and then restores its context menu without toggling it closed', () => {
  const host = document.createElement('div');
  host.innerHTML = '<button class="folder" aria-expanded="false">Folder</button>';
  document.body.append(host);
  const folder = host.querySelector<HTMLButtonElement>('button')!;
  const clicked = vi.fn(),
    opened = vi.fn();
  folder.addEventListener('click', clicked);
  folder.addEventListener('contextmenu', opened);
  const restore = createTutorialActionRestorer([{ expand: '.folder' }, { contextMenu: '.folder' }], 'en', vi.fn());
  try {
    expect(restore()).toBe(false);
    expect(restore()).toBe(false);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(opened).not.toHaveBeenCalled();
    folder.setAttribute('aria-expanded', 'true');
    expect(restore()).toBe(true);
    expect(restore()).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0][0] as MouseEvent).bubbles).toBe(true);
  } finally {
    host.remove();
  }
});

it.each([true, false])('collapses an inspector without reopening it, initially expanded: %s', (expanded) => {
  const host = document.createElement('div');
  host.innerHTML = `<button class="inspector" aria-expanded="${expanded}">Inspector</button>`;
  document.body.append(host);
  const control = host.querySelector<HTMLButtonElement>('button')!;
  const clicked = vi.fn();
  control.addEventListener('click', clicked);
  const restore = createTutorialActionRestorer([{ collapse: '.inspector' }], 'en', vi.fn());
  try {
    if (expanded) {
      expect(restore()).toBe(false);
      expect(restore()).toBe(false);
      expect(clicked).toHaveBeenCalledOnce();
      control.setAttribute('aria-expanded', 'false');
    }
    expect(restore()).toBe(true);
    expect(restore()).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(expanded ? 1 : 0);
  } finally {
    host.remove();
  }
});

it('waits for an enabled keyboard control and submits it once before checking the next result', () => {
  const host = document.createElement('div');
  host.innerHTML = '<input class="branch-name" disabled>';
  document.body.append(host);
  const field = host.querySelector('input')!;
  const entered = vi.fn();
  field.addEventListener('keydown', entered);
  const resumes: (() => void)[] = [];
  const restore = createTutorialActionRestorer([{ pressKey: { selector: '.branch-name', key: 'Enter' } }, { waitFor: '.branch-created' }], 'en', (resume) =>
    resumes.push(resume),
  );
  try {
    expect(restore()).toBe(false);
    expect(entered).not.toHaveBeenCalled();
    field.disabled = false;
    expect(restore()).toBe(false);
    expect(document.activeElement).toBe(field);
    expect((entered.mock.calls[0][0] as KeyboardEvent).key).toBe('Enter');
    expect(restore()).toBe(false);
    expect(entered).toHaveBeenCalledOnce();
    resumes.shift()!();
    expect(restore()).toBe(false);
    host.insertAdjacentHTML('beforeend', '<output class="branch-created"></output>');
    expect(restore()).toBe(true);
    expect(restore()).toBe(true);
    expect(entered).toHaveBeenCalledOnce();
  } finally {
    host.remove();
  }
});
it('starts restored navigation after the parent has applied its initial compact layout', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const container = document.createElement('div');
  container.className = 'tutorial-workspace';
  document.body.append(container);
  const root = createRoot(container),
    toggled = vi.fn();
  const current: TutorialStep = {
    id: 'branch-entry',
    title: ['', ''],
    description: ['', ''],
    area: 'repo',
    target: '.branch-pane',
    prepare: { actions: [{ expand: '.sidebar-button' }], ready: '.branch-pane' },
  };
  function Preparation() {
    const ready = useTutorialPreparation(current, 'en');
    return <output data-ready={ready} />;
  }
  function Parent() {
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
      setExpanded(false);
    }, []);
    return (
      <>
        <button
          className="sidebar-button"
          aria-expanded={expanded}
          onClick={() => {
            toggled();
            setExpanded((value) => !value);
          }}
        >
          Sidebar
        </button>
        {expanded && <div className="branch-pane" />}
        <Preparation />
      </>
    );
  }
  try {
    await act(async () => {
      root.render(<Parent />);
    });
    while (frames.length)
      await act(async () => {
        frames.shift()!(0);
      });
    expect(toggled).toHaveBeenCalledOnce();
    expect(container.querySelector('.branch-pane')).not.toBeNull();
    expect(container.querySelector('output')?.getAttribute('data-ready')).toBe('true');
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
it('restores a controlled schema field before submitting its dependent dialog, once', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  container.className = 'tutorial-workspace';
  document.body.append(container);
  const root = createRoot(container);
  const submit = vi.fn();
  const step: TutorialStep = {
    id: 'schema',
    title: ['', ''],
    description: ['', ''],
    area: 'repo',
    target: 'output',
    prepare: {
      actions: [
        { click: '.open' },
        { waitValue: { selector: 'textarea', value: ['default', 'default'] } },
        { fill: { selector: 'textarea', value: ['eingetragen', 'entered'] } },
        { waitFor: 'textarea[data-current="entered"]' },
        { click: '.submit' },
      ],
      ready: 'output',
    },
  };
  function Form() {
    const [open, setOpen] = useState(false),
      [value, setValue] = useState(''),
      [submitted, setSubmitted] = useState(false);
    const ready = useTutorialPreparation(step, 'en');
    useEffect(() => {
      if (open) setValue('default');
    }, [open]);
    return (
      <>
        <button className="open" onClick={() => setOpen(true)}>
          Open
        </button>
        {open && (
          <>
            <textarea data-current={value} value={value} onChange={(event) => setValue(event.target.value)} />
            <button
              className="submit"
              onClick={() => {
                submit(value);
                setSubmitted(true);
                setOpen(false);
              }}
            >
              Submit
            </button>
          </>
        )}
        {submitted && <output>{String(ready)}</output>}
      </>
    );
  }
  try {
    await act(async () => {
      root.render(<Form />);
    });
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    });
    expect(submit).toHaveBeenCalledExactlyOnceWith('entered');
    expect(container.querySelector('output')?.textContent).toBe('true');
    await act(async () => {
      container.querySelector('output')!.append(' another mutation');
    });
    expect(submit).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
