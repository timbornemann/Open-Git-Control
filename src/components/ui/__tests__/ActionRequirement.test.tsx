// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionRequirement } from '../ActionRequirement';
import { Button } from '../Button';

describe('action prerequisites', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it('explains a disabled action visibly and accessibly, while the remedy remains usable', () => {
    const execute = vi.fn(),
      configure = vi.fn();
    act(() =>
      root.render(
        createElement(ActionRequirement, {
          reason: 'Client ID missing',
          remedy: { label: 'Configure OAuth', onClick: configure },
          children: createElement(Button, { onClick: execute, 'aria-describedby': 'existing-help', type: 'submit' }, 'Sign in'),
        }),
      ),
    );
    const [action, remedy] = host.querySelectorAll('button');
    expect(action.disabled).toBe(true);
    expect(action.title).toBe('Client ID missing');
    const description = action.getAttribute('aria-describedby')!.split(' ');
    expect(description[0]).toBe('existing-help');
    expect(document.getElementById(description[1])?.textContent).toBe('Client ID missing');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(remedy.disabled).toBe(false);
    expect(remedy.type).toBe('button');
    act(() => {
      action.click();
      remedy.focus();
      remedy.click();
    });
    expect(document.activeElement).toBe(remedy);
    expect(execute).not.toHaveBeenCalled();
    expect(configure).toHaveBeenCalledOnce();
  });
  it('removes the explanation when resolved and retains independent operation locks', () => {
    const execute = vi.fn();
    const render = (reason: string | null, disabled: boolean) =>
      act(() =>
        root.render(
          createElement(ActionRequirement, {
            reason,
            children: createElement('button', { disabled, onClick: execute }, 'Run'),
          }),
        ),
      );
    render('Missing target', false);
    render(null, true);
    expect(host.querySelector('.ui-action-requirement')).toBeNull();
    expect(host.querySelector('button')!.disabled).toBe(true);
    render(null, false);
    act(() => host.querySelector('button')!.click());
    expect(execute).toHaveBeenCalledOnce();
  });
});
