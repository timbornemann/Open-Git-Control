import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NotificationEntry, NotificationMessage } from '@/types/notifications';

type UseToastQueueOptions = {
  autoHideMs?: number;
  errorAutoHideMs?: number | null;
};

let nextId = 0;

export const useToastQueue = (config: number | UseToastQueueOptions = 3000) => {
  const options = typeof config === 'number' ? { autoHideMs: config } : config;
  const autoHideMs = options.autoHideMs ?? 3000;
  const errorAutoHideMs = options.errorAutoHideMs === undefined ? autoHideMs : options.errorAutoHideMs;

  const [toasts, setToasts] = useState<NotificationEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const latestToastsRef = useRef<NotificationEntry[]>([]);

  const commit = useCallback((entries: NotificationEntry[]) => {
    latestToastsRef.current = entries;
    setToasts(entries);
  }, []);

  const clearTimer = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      commit(latestToastsRef.current.filter((t) => t.id !== id));
      clearTimer(id);
    },
    [clearTimer, commit],
  );

  const schedule = useCallback(
    (id: number, message: NotificationMessage) => {
      clearTimer(id);
      const delay = message.autoHideMs !== undefined ? message.autoHideMs : message.isError ? errorAutoHideMs : autoHideMs;
      if (typeof delay === 'number' && delay > 0)
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), delay),
        );
    },
    [autoHideMs, errorAutoHideMs, dismiss, clearTimer],
  );

  const publish = useCallback(
    (message: NotificationMessage) => {
      const id = ++nextId;
      const entries = [...latestToastsRef.current, { ...message, id }];
      // Keep active operations visible when ordinary notifications fill the queue.
      while (entries.length > 5) {
        const index = entries.findIndex((entry) => entry.kind !== 'progress' && entry.id !== id);
        if (index < 0) break;
        clearTimer(entries[index].id);
        entries.splice(index, 1);
      }
      commit(entries);
      schedule(id, message);
      return id;
    },
    [clearTimer, commit, schedule],
  );

  const update = useCallback(
    (id: number, message: NotificationMessage) => {
      if (!latestToastsRef.current.some((entry) => entry.id === id)) return false;
      commit(latestToastsRef.current.map((entry) => (entry.id === id ? { ...message, id } : entry)));
      schedule(id, message);
      return true;
    },
    [commit, schedule],
  );

  const setToast = useCallback(
    (msg: NotificationMessage | null) => {
      if (!msg) {
        commit([]);
        timersRef.current.forEach((t) => clearTimeout(t));
        timersRef.current.clear();
        return;
      }

      const lastToast = latestToastsRef.current[latestToastsRef.current.length - 1];
      if (lastToast && lastToast.msg === msg.msg && lastToast.isError === msg.isError && lastToast.kind === msg.kind) {
        return;
      }

      publish(msg);
    },
    [commit, publish],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const pushSuccess = useCallback((msg: string) => setToast({ msg, isError: false }), [setToast]);
  const pushError = useCallback((msg: string) => setToast({ msg, isError: true }), [setToast]);
  const clearToast = useCallback(() => setToast(null), [setToast]);

  // Backward-compat: expose last toast as `toast`
  const toast = toasts.length > 0 ? toasts[toasts.length - 1] : null;

  const notifications = useMemo(() => ({ publish, update, dismiss }), [publish, update, dismiss]);
  return { toast, toasts, setToast, pushSuccess, pushError, clearToast, dismiss, notifications };
};
