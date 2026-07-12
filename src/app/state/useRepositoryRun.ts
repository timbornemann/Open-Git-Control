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
  const configRequestGenerationRef = useRef(0);
  // A run event can arrive between committing a repository switch and its
  // effect. Keep this identity current during render so that event cannot
  // publish configuration from the repository that was just left.
  activeRepoRef.current = activeRepo;

  useEffect(() => {
    configRequestGenerationRef.current += 1;
    isConsoleOpenRef.current = false;
    setConsoleOpen(false);
    setActiveConfig(null);
  }, [activeRepo]);

  const refreshConfig = useCallback(async (requestedRepoPath?: string) => {
    const repoPath = requestedRepoPath ?? activeRepoRef.current;
    if (!repoPath || !repositoryRunClient.isAvailable()) {
      if (repoPath === activeRepoRef.current) setActiveConfig(null);
      return;
    }
    // Run-completion events can arrive after the user selected another
    // repository. Those events must not start (or invalidate) a config read
    // for the repository currently shown in the sidebar.
    if (repoPath !== activeRepoRef.current) return;

    const requestGeneration = configRequestGenerationRef.current + 1;
    configRequestGenerationRef.current = requestGeneration;
    const result = await repositoryRunClient.getConfig(repoPath);
    if (requestGeneration !== configRequestGenerationRef.current || repoPath !== activeRepoRef.current) return;
    setActiveConfig(result.success ? result.data : null);
  }, []);

  useEffect(() => {
    void refreshConfig(activeRepo ?? undefined);
  }, [activeRepo, refreshConfig]);

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
