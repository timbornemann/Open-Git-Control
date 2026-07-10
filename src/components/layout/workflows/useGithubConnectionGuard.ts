import { useCallback, useRef } from 'react';

export type GithubConnectionRun = { id: number; repoPath: string };

export const useGithubConnectionGuard = (isRepoActive: (repoPath: string) => boolean, setIsConnecting: (value: boolean) => void) => {
  const activeRunRef = useRef<GithubConnectionRun | null>(null);
  const nextRunIdRef = useRef(0);
  const begin = useCallback(
    (repoPath: string) => {
      if (activeRunRef.current) return null;
      const run = { id: ++nextRunIdRef.current, repoPath };
      activeRunRef.current = run;
      setIsConnecting(true);
      return run;
    },
    [setIsConnecting],
  );
  const isCurrent = useCallback(
    (run: GithubConnectionRun) => activeRunRef.current?.id === run.id && activeRunRef.current.repoPath === run.repoPath && isRepoActive(run.repoPath),
    [isRepoActive],
  );
  const finish = useCallback(
    (run: GithubConnectionRun) => {
      if (activeRunRef.current?.id !== run.id) return;
      activeRunRef.current = null;
      if (isRepoActive(run.repoPath)) setIsConnecting(false);
    },
    [isRepoActive, setIsConnecting],
  );
  const invalidate = useCallback(() => {
    activeRunRef.current = null;
    setIsConnecting(false);
  }, [setIsConnecting]);
  return { begin, isCurrent, finish, invalidate };
};
