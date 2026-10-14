import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Each pane pins async results to the account/repository that initiated them. */
export function useHostingTask(scope: string, onError?: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setTaskError] = useState<string | null>(null);
  const errorHandler = useRef(onError);
  useLayoutEffect(() => {
    errorHandler.current = onError;
  }, [onError]);
  const setError = useCallback((message: string | null) => {
    setTaskError(message);
    if (message) errorHandler.current?.(message);
  }, []);
  const lifecycle = useRef({ generation: 0, pending: 0 }).current;
  useLayoutEffect(() => {
    lifecycle.generation++;
    lifecycle.pending = 0;
    setBusy(false);
    setError(null);
    return () => {
      lifecycle.generation++;
      lifecycle.pending = 0;
    };
  }, [scope, lifecycle, setError]);
  const run = useCallback(
    async <T>(operation: () => Promise<T>, apply?: (result: T) => void): Promise<T | undefined> => {
      const started = lifecycle.generation;
      lifecycle.pending++;
      setBusy(true);
      setError(null);
      try {
        const result = await operation();
        if (started === lifecycle.generation) {
          apply?.(result);
          return result;
        }
      } catch (reason) {
        if (started === lifecycle.generation) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (started === lifecycle.generation) {
          lifecycle.pending--;
          setBusy(lifecycle.pending > 0);
        }
      }
      return undefined;
    },
    [lifecycle, setError],
  );
  const cancel = useCallback(() => {
    lifecycle.generation++;
    lifecycle.pending = 0;
    setBusy(false);
    setError(null);
  }, [lifecycle, setError]);
  return { busy, error, run, setError, cancel };
}
