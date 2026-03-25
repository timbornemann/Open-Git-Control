import { useCallback, useEffect, useRef, useState } from 'react';
import { ToastMessage } from '../types/git';

type ToastEntry = ToastMessage & { id: number };

let nextId = 0;

export const useToastQueue = (autoHideMs = 3000) => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const setToast = useCallback((msg: ToastMessage | null) => {
    if (!msg) {
      setToasts([]);
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
      return;
    }
    const id = ++nextId;
    setToasts(prev => [...prev.slice(-4), { ...msg, id }]);
    const timer = setTimeout(() => dismiss(id), autoHideMs);
    timersRef.current.set(id, timer);
  }, [autoHideMs, dismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const pushSuccess = useCallback((msg: string) => setToast({ msg, isError: false }), [setToast]);
  const pushError = useCallback((msg: string) => setToast({ msg, isError: true }), [setToast]);
  const clearToast = useCallback(() => setToast(null), [setToast]);

  // Backward-compat: expose last toast as `toast`
  const toast = toasts.length > 0 ? toasts[toasts.length - 1] : null;

  return { toast, toasts, setToast, pushSuccess, pushError, clearToast, dismiss };
};
