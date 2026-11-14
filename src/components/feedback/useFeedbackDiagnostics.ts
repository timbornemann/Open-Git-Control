import { useEffect, useRef, useState } from 'react';
import { appClient } from '@/services/appClient';

export function useFeedbackDiagnostics(enabled: boolean) {
  const lifecycle = useRef({ generation: 0, loaded: false }).current;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ value: '', status: 'idle' as 'idle' | 'loading' | 'ready' | 'error', error: '' });
  useEffect(() => {
    if (!enabled || lifecycle.loaded || !appClient.isAvailable()) return;
    const request = ++lifecycle.generation;
    setState((previous) => ({ ...previous, status: 'loading', error: '' }));
    void appClient.getDiagnosticsReport().then(
      (report) => {
        if (lifecycle.generation !== request) return;
        lifecycle.loaded = report.success;
        setState(report.success ? { value: report.data.report, status: 'ready', error: '' } : { value: '', status: 'error', error: report.error });
      },
      (error: unknown) => {
        if (lifecycle.generation === request) setState({ value: '', status: 'error', error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      lifecycle.generation++;
    };
  }, [enabled, retry, lifecycle]);
  return {
    ...state,
    pending: enabled && state.status !== 'ready',
    edit: (value: string) => setState({ value, status: 'ready', error: '' }),
    retry: () => {
      lifecycle.loaded = false;
      setRetry((previous) => previous + 1);
    },
  };
}
