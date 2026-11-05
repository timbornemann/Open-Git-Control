// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DialogFrame } from './DialogFrame';
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let host: HTMLDivElement, root: Root, outside: HTMLInputElement;
const entered = vi.fn(),
  closed = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  host = document.createElement('div');
  outside = document.createElement('input');
  document.body.append(host, outside);
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(DialogFrame, {
        open: true,
        title: 'Publish branch',
        onClose: closed,
        onEnter: entered,
        onConfirm: entered,
        children: createElement('input', { className: 'dialog-input' }),
      }),
    ),
  );
  act(() => vi.runOnlyPendingTimers());
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  outside.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function key(target: HTMLElement, options: KeyboardEventInit = {}, handled = false) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
  if (handled) event.preventDefault();
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}
it('confirms Enter from its own input once', () => {
  expect(key(host.querySelector('input')!).defaultPrevented).toBe(true);
  expect(entered).toHaveBeenCalledOnce();
});
it('does not confirm a new dialog from an Enter already handled by another action', () => {
  key(host.querySelector('input')!, {}, true);
  expect(entered).not.toHaveBeenCalled();
});
it('does not turn Enter outside the dialog into confirmation', () => {
  expect(key(outside).defaultPrevented).toBe(false);
  expect(entered).not.toHaveBeenCalled();
});
it.each([{ repeat: true }, { isComposing: true }])('ignores a held or composing Enter: %j', (options) => {
  key(host.querySelector('input')!, options);
  expect(entered).not.toHaveBeenCalled();
});
