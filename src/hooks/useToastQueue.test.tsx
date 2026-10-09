// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useToastQueue } from './useToastQueue';
import { explainGitNotification } from '@/utils/gitFailure';

let root: Root;
let queue: ReturnType<typeof useToastQueue>;
function Harness() {
  queue = useToastQueue({ autoHideMs: 3000, errorAutoHideMs: null, prepareMessage: (message) => explainGitNotification(message, (_de, en) => en) });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Harness)));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('central notification lifecycle', () => {
  it('prepares both legacy errors and completed progress without losing distinct diagnostics', () => {
    act(() => {
      queue.pushError('fatal: unable to access server: HTTP 502');
      queue.pushError('fatal: unable to access server: HTTP 503');
      queue.pushError('fatal: unable to access server: HTTP 503');
    });
    expect(queue.toasts).toHaveLength(2);
    expect(queue.toasts[0].msg).toBe(queue.toasts[1].msg);
    expect(queue.toasts[0].technicalDetails).toContain('502');
    expect(queue.toasts[1].technicalDetails).toContain('503');
    let id!: number;
    act(() => {
      id = queue.notifications.publish({ msg: 'Pushing', isError: false, kind: 'progress', autoHideMs: null });
    });
    act(() => {
      queue.notifications.update(id, { msg: 'fatal: Authentication failed', isError: true });
    });
    expect(queue.toast).toMatchObject({ id, technicalDetails: 'fatal: Authentication failed', errorExplained: true });
    expect(queue.toast?.msg).toContain('permissions');
  });
  it('keeps progress alive then expires cancellation in the same entry', () => {
    let id!: number;
    act(() => {
      id = queue.notifications.publish({ msg: 'Push running', isError: false, kind: 'progress', autoHideMs: null });
    });
    advance(20_000);
    expect(queue.toast?.id).toBe(id);
    act(() => {
      queue.notifications.update(id, { msg: 'Push cancelled', isError: false, kind: 'info' });
    });
    expect(queue.toasts).toHaveLength(1);
    advance(2999);
    expect(queue.toast?.msg).toBe('Push cancelled');
    advance(1);
    expect(queue.toasts).toEqual([]);
  });
  it('starts completion expiry at the update and removes the previous timer', () => {
    let id!: number;
    act(() => {
      id = queue.notifications.publish({ msg: 'Preparing', isError: false });
    });
    advance(2000);
    act(() => {
      queue.notifications.update(id, { msg: 'Running', isError: false, kind: 'progress', autoHideMs: null });
    });
    advance(10_000);
    expect(queue.toasts).toHaveLength(1);
    act(() => {
      queue.notifications.update(id, { msg: 'Completed', isError: false });
    });
    advance(3000);
    expect(queue.toasts).toEqual([]);
  });
  it('keeps actual errors dismissible while ordinary successes expire', () => {
    act(() => {
      queue.pushError('Network failed');
      queue.pushSuccess('Saved');
    });
    advance(3000);
    expect(queue.toasts.map((entry) => entry.msg)).toEqual(['Network failed']);
    act(() => queue.dismiss(queue.toast!.id));
    expect(queue.toasts).toEqual([]);
  });
  it('deduplicates synchronous ordinary messages and keeps active progress in a bounded queue', () => {
    act(() => {
      queue.pushSuccess('Saved');
      queue.pushSuccess('Saved');
    });
    expect(queue.toasts).toHaveLength(1);
    act(() => {
      queue.notifications.publish({ msg: 'Running', isError: false, kind: 'progress', autoHideMs: null });
      for (let index = 0; index < 10; index++) queue.pushSuccess(`Saved ${index}`);
    });
    expect(queue.toasts).toHaveLength(5);
    expect(queue.toasts.some((entry) => entry.msg === 'Running')).toBe(true);
    expect(vi.getTimerCount()).toBe(4);
    act(() => queue.clearToast());
    expect(queue.toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not resurrect a dismissed entry on a late progress update', () => {
    let id!: number;
    act(() => {
      id = queue.notifications.publish({ msg: 'Running', isError: false });
    });
    act(() => queue.dismiss(id));
    let updated = true;
    act(() => {
      updated = queue.notifications.update(id, { msg: 'Late', isError: false });
    });
    expect(updated).toBe(false);
    expect(queue.toasts).toEqual([]);
  });
});
