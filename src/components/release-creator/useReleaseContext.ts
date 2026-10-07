import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import type { HostingOperations } from '@/shared/ipc/contracts/hosting';
import type { ReleaseContext } from '@/types/releaseNotes';

export function useReleaseContext(input: HostingOperations['releaseContext']['input'] | null, scope: string, refreshTrigger: number) {
  const key = JSON.stringify([input, scope]);
  const inputRef = useRef(input);
  const lifecycle = useRef({ generation: 0 }).current;
  const [state, setState] = useState<{ key: string; context: ReleaseContext | null; loading: boolean; error: string }>({
    key,
    context: null,
    loading: false,
    error: '',
  });
  useLayoutEffect(() => {
    inputRef.current = input;
  }, [input]);
  useLayoutEffect(() => {
    lifecycle.generation++;
    return () => {
      lifecycle.generation++;
    };
  }, [key, lifecycle]);
  const refresh = useCallback(async () => {
    const request = inputRef.current;
    const started = ++lifecycle.generation;
    if (!request) {
      setState({ key, context: null, loading: false, error: '' });
      return;
    }
    setState((previous) => ({ key, context: previous.key === key ? previous.context : null, loading: true, error: '' }));
    try {
      const context = await hostingClient.request('releaseContext', request);
      if (started === lifecycle.generation) {
        setState({ key, context, loading: false, error: '' });
        return context;
      }
    } catch (reason) {
      if (started === lifecycle.generation) setState({ key, context: null, loading: false, error: reason instanceof Error ? reason.message : String(reason) });
    }
    return null;
  }, [key, lifecycle]);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshTrigger]);
  return {
    context: state.key === key ? state.context : null,
    loading: Boolean(input) && (state.key !== key || state.loading),
    error: state.key === key ? state.error : '',
    refresh,
  };
}
