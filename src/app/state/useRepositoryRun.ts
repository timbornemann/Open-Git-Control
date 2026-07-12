import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';

const trimOutput = (state: RepositoryRunStateDto): RepositoryRunStateDto => ({ ...state, output: state.output.slice(-4_000) });

export const useRepositoryRun = ({ activeRepo, triggerRefresh }: { activeRepo: string | null; triggerRefresh: () => void }) => {
  const [runState, setRunState] = useState<RepositoryRunStateDto | null>(null);
  const [activeConfig, setActiveConfig] = useState<RepositoryRunConfigStateDto | null>(null);
  const [isConsoleOpen, setConsoleOpen] = useState(false);
  const [lastViewedRunId, setLastViewedRunId] = useState<string | null>(null);
  const refreshedRunIds = useRef(new Set<string>());
  const activeRepoRef = useRef(activeRepo);
  const isConsoleOpenRef = useRef(isConsoleOpen);

  useEffect(() => {
    activeRepoRef.current = activeRepo;
    isConsoleOpenRef.current = false;
    setConsoleOpen(false);
  }, [activeRepo]);

  const refreshConfig = useCallback(
    async (repoPath = activeRepo) => {
      if (!repoPath || !repositoryRunClient.isAvailable()) {
        setActiveConfig(null);
        return;
      }
      const result = await repositoryRunClient.getConfig(repoPath);
      if (result.success && repoPath === activeRepo) setActiveConfig(result.data);
    },
    [activeRepo],
  );

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    if (!repositoryRunClient.isAvailable()) return;
    let active = true;
    void repositoryRunClient.getState().then((result) => {
      if (active && result.success) setRunState(result.data);
    });
    return repositoryRunClient.onEvent((event) => {
      if (!active) return;
      if (event.type === 'state') {
        setRunState(event.state);
        if (event.state && event.state.status !== 'running' && !refreshedRunIds.current.has(event.state.runId)) {
          if (isConsoleOpenRef.current && event.state.repoPath === activeRepoRef.current) setLastViewedRunId(event.state.runId);
          refreshedRunIds.current.add(event.state.runId);
          triggerRefresh();
          void refreshConfig(event.state.repoPath);
        }
        return;
      }
      setRunState((previous) => {
        if (!previous || previous.runId !== event.runId) return previous;
        return trimOutput({ ...previous, output: [...previous.output, event.line] });
      });
    });
  }, [refreshConfig, triggerRefresh]);

  const startRun = useCallback(
    async (action: RepositoryRunActionId): Promise<boolean> => {
      if (!activeRepo || !repositoryRunClient.isAvailable()) return false;
      const result = await repositoryRunClient.start(activeRepo, action);
      if (!result.success) return false;
      setRunState(result.data);
      isConsoleOpenRef.current = true;
      setConsoleOpen(true);
      return true;
    },
    [activeRepo],
  );

  const stopRun = useCallback(async (): Promise<boolean> => {
    const result = await repositoryRunClient.stop(runState?.runId);
    return result.success && result.data;
  }, [runState?.runId]);

  const openRunConsole = useCallback(() => {
    if (!runState || runState.repoPath !== activeRepo) return;
    if (runState.status !== 'running') setLastViewedRunId(runState.runId);
    isConsoleOpenRef.current = true;
    setConsoleOpen(true);
  }, [activeRepo, runState]);

  const closeRunConsole = useCallback(() => {
    isConsoleOpenRef.current = false;
    setConsoleOpen(false);
  }, []);

  const hasUnreadResult = Boolean(runState && runState.status !== 'running' && runState.repoPath === activeRepo && runState.runId !== lastViewedRunId);

  return {
    runState,
    activeRunConfig: activeConfig,
    isRunConsoleOpen: isConsoleOpen,
    hasUnreadRepositoryRunResult: hasUnreadResult,
    startRun,
    stopRun,
    openRunConsole,
    closeRunConsole,
    refreshRunConfig: refreshConfig,
  };
};
