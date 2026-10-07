// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import type { GitJobEventDto } from '@/types/aiDtos';
import { GitTransferProgressNotification } from './GitTransferProgressNotification';

describe('Git recovery transfer notifications', () => {
  it('updates one central progress entry, removes it on completion, and leaves other messages intact', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    const container = document.createElement('div');
    const root = createRoot(container);
    let queue!: ReturnType<typeof useToastQueue>;
    function Harness({ open, events }: { open: boolean; events: GitJobEventDto[] }) {
      queue = useToastQueue();
      return createElement(I18nProvider, {
        language: 'en',
        children: createElement(
          NotificationProvider,
          { value: queue.notifications },
          createElement(
            Fragment,
            null,
            createElement(GitTransferProgressNotification, { open, title: 'Fetch origin', events }),
            createElement(ActionToastViewport, { toasts: queue.toasts, onDismiss: queue.dismiss }),
          ),
        ),
      });
    }
    const render = (open: boolean, events: GitJobEventDto[] = []) =>
      act(async () => {
        root.render(createElement(Harness, { open, events }));
      });
    try {
      await render(true);
      const id = queue.toast!.id;
      expect(container.querySelector('.toast-container .action-toast.progress')).not.toBeNull();
      expect(container.querySelector('.git-transfer-backdrop')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      expect(queue.toast?.id).toBe(id);
      await render(true, [{ id: 'fetch', operation: 'git:fetch', status: 'progress', message: 'Receiving objects: 80%', timestamp: Date.now() }]);
      expect(queue.toasts).toHaveLength(1);
      expect(queue.toast).toMatchObject({ id, msg: 'Receiving objects: 80%' });
      await act(async () => {
        queue.pushSuccess('Fetch completed');
      });
      await render(false);
      expect(queue.toasts.map((toast) => toast.msg)).toEqual(['Fetch completed']);
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(container.querySelector('.toast-container')).toBeNull();
    } finally {
      act(() => root.unmount());
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });
});
