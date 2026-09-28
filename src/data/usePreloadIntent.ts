import { useCallback, useEffect, useRef } from 'react';
import { preload } from './clientCache';

/** Keyboard focus is an immediate signal; a pointer must settle for 150 ms. */
export function usePreloadIntent() {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    hover: (read: () => Promise<unknown>) => {
      cancel();
      timer.current = setTimeout(() => {
        void preload(read);
      }, 150);
    },
    focus: (read: () => Promise<unknown>) => {
      cancel();
      void preload(read);
    },
    cancel,
  };
}
