// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { Confirm } from './Confirm';
import { DangerConfirm } from './DangerConfirm';
import { Input } from './Input';

let root: Root;
let host: HTMLDivElement;
const confirmed = vi.fn(),
  alternative = vi.fn(),
  cancelled = vi.fn(),
  inspect = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function render(children: React.ReactNode) {
  act(() => root.render(createElement(I18nProvider, { language: 'en', children })));
  act(() => vi.runOnlyPendingTimers());
}
const action = (name: string) => host.querySelector<HTMLButtonElement>(`[data-dialog-action="${name}"]`)!;

describe('guided shared dialogs', () => {
  it('keeps action details in order and omits the irrelevant irreversible-no notice', () => {
    render(
      createElement(Confirm, {
        open: true,
        title: 'Switch remote',
        message: 'Choose this remote for future pulls.',
        contextItems: [
          { label: 'Repository', value: '/repo' },
          { label: 'Remote', value: 'origin' },
        ],
        onConfirm: confirmed,
        onCancel: cancelled,
      }),
    );
    expect(host.textContent).toContain('Action details');
    expect(host.querySelector('.dialog-context-list dd:nth-of-type(2)')?.textContent).toBe('origin');
    expect(host.querySelector('[data-dialog-context-value="/repo"]')).not.toBeNull();
    expect(host.querySelector('.dialog-impact')).toBeNull();
    expect(host.textContent).not.toContain('Irreversible');
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('explains consequences for a reversible action without claiming data loss', () => {
    render(
      createElement(Confirm, {
        open: true,
        title: 'Apply stash',
        message: 'Apply the saved files.',
        irreversible: false,
        consequences: 'The saved stash remains available afterwards.',
        onConfirm: confirmed,
        onCancel: cancelled,
      }),
    );
    expect(host.querySelector('.dialog-impact')?.textContent).toContain('What happens next');
    expect(host.querySelector('.dialog-impact')?.getAttribute('data-dialog-irreversible')).toBe('false');
    expect(host.querySelector('.dialog-impact')?.textContent).toContain('The saved stash remains available afterwards.');
    expect(host.textContent).not.toContain('Cannot be undone automatically');
  });

  it('focuses cancel for a destructive decision and keeps inspection, alternative and execution separate', () => {
    render(
      createElement(DangerConfirm, {
        open: true,
        title: 'Reset to commit',
        message: 'Reset the branch and working files.',
        contextAction: { label: 'Review files', onClick: inspect },
        contextItems: [{ label: 'Commit', value: 'abc123' }],
        consequences: 'Uncommitted edits will be removed.',
        confirmLabel: 'Reset files',
        secondaryActionLabel: 'Create a recovery branch',
        onConfirm: confirmed,
        onSecondaryAction: alternative,
        onCancel: cancelled,
      }),
    );
    expect(document.activeElement).toBe(action('cancel'));
    expect(host.querySelector('.dialog-impact')?.textContent).toContain('Uncommitted edits will be removed.');
    expect(host.querySelector('.dialog-impact')?.getAttribute('data-dialog-irreversible')).toBe('true');
    expect(action('confirm').classList.contains('dialog-btn-danger')).toBe(true);
    expect(action('secondary').classList.contains('dialog-btn-primary')).toBe(false);
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Review files')!.click());
    expect(inspect).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
    act(() => action('secondary').click());
    expect(alternative).toHaveBeenCalledOnce();
    expect(confirmed).not.toHaveBeenCalled();
    act(() => action('confirm').click());
    expect(confirmed).toHaveBeenCalledOnce();
  });

  it('honors the explicit focus-confirm preference on confirmation dialogs', () => {
    render(
      createElement(Confirm, {
        open: true,
        title: 'Continue',
        message: 'Continue the reviewed operation.',
        confirmVariant: 'danger',
        focusConfirm: true,
        onConfirm: confirmed,
        onCancel: cancelled,
      }),
    );
    expect(document.activeElement).toBe(action('confirm'));
  });

  it('preserves field focus, validation and submitted values in input dialogs', () => {
    const submitted = vi.fn();
    render(
      createElement(Input, {
        open: true,
        title: 'New branch',
        message: 'Name the new branch.',
        fields: [{ id: 'branch', label: 'Branch', required: true }],
        contextItems: [{ label: 'Start point', value: 'main' }],
        consequences: 'The new branch starts at main.',
        onSubmit: submitted,
        onCancel: cancelled,
      }),
    );
    const input = host.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    expect(action('confirm').disabled).toBe(true);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'feature/new');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(action('confirm').disabled).toBe(false);
    expect(host.querySelector('.dialog-impact')?.textContent).toContain('The new branch starts at main.');
    act(() => action('confirm').click());
    expect(submitted).toHaveBeenCalledExactlyOnceWith({ branch: 'feature/new' });
  });
});
