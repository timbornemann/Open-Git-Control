import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';

const trimOutput = (state: RepositoryRunStateDto): RepositoryRunStateDto => ({ ...state, output: state.output.slice(-4_000) });

export const useRepositoryRun = ({ activeRepo, triggerRefresh }: { activeRepo: string | null; triggerRefresh: () => void }) => {
  const [runState, setRunState] = useState<RepositoryRunStateDto | null>(null);
  const [activeConfig, setActiveConfig] = useState<RepositoryRunConfigStateDto | null>(null);
  const [isConsoleOpen, setConsoleOpen] = useState(false);
  const refreshedRunIds = useRef(new Set<string>());

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
      setConsoleOpen(true);
      return true;
    },
    [activeRepo],
  );

  const stopRun = useCallback(async (): Promise<boolean> => {
    const result = await repositoryRunClient.stop(runState?.runId);
    return result.success && result.data;
  }, [runState?.runId]);

  return {
    runState,
    activeRunConfig: activeConfig,
    isRunConsoleOpen: isConsoleOpen,
    startRun,
    stopRun,
    openRunConsole: () => setConsoleOpen(true),
    closeRunConsole: () => setConsoleOpen(false),
    refreshRunConfig: refreshConfig,
  };
};
