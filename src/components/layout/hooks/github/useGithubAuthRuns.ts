import { useCallback, useEffect, useRef } from 'react';

type AuthRunKind = 'bootstrap' | 'token' | 'device' | 'web' | 'logout';
export type AuthRun = { id: number; kind: AuthRunKind };

/** One authentication attempt owns the session. Late replies from cancelled
 * attempts or a previous host cannot restore that session. */
export function useGithubAuthRuns() {
  const pollingRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const activeAuthRunRef = useRef<AuthRun | null>(null);
  const nextAuthRunIdRef = useRef(0);
  const clearDevicePolling = useCallback(() => {
    if (pollingRef.current !== null) window.clearTimeout(pollingRef.current);
    pollingRef.current = null;
  }, []);
  const beginAuthRun = useCallback((kind: AuthRunKind, replaceBootstrap = false): AuthRun | null => {
    const activeRun = activeAuthRunRef.current;
    if (activeRun && !(replaceBootstrap && activeRun.kind === 'bootstrap')) return null;
    const run = { id: ++nextAuthRunIdRef.current, kind };
    activeAuthRunRef.current = run;
    return run;
  }, []);
  const isCurrentAuthRun = useCallback(
    (run: AuthRun) => !stoppedRef.current && activeAuthRunRef.current?.id === run.id && activeAuthRunRef.current.kind === run.kind,
    [],
  );
  const finishAuthRun = useCallback((run: AuthRun) => {
    if (activeAuthRunRef.current?.id === run.id) activeAuthRunRef.current = null;
  }, []);
  const invalidateAuthRuns = useCallback(() => {
    nextAuthRunIdRef.current += 1;
    activeAuthRunRef.current = null;
    clearDevicePolling();
  }, [clearDevicePolling]);
  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      clearDevicePolling();
    };
  }, [clearDevicePolling]);
  return { pollingRef, activeAuthRunRef, clearDevicePolling, beginAuthRun, isCurrentAuthRun, finishAuthRun, invalidateAuthRuns };
}
