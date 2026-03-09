import { useCallback, useEffect, useState } from 'react';
import { ToastMessage } from '../types/git';

export const useToastQueue = (autoHideMs = 3000) => {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), autoHideMs);
    return () => clearTimeout(t);
  }, [toast, autoHideMs]);

  const pushSuccess = useCallback((msg: string) => setToast({ msg, isError: false }), []);
  const pushError = useCallback((msg: string) => setToast({ msg, isError: true }), []);
  const clearToast = useCallback(() => setToast(null), []);

  return { toast, setToast, pushSuccess, pushError, clearToast };
};
