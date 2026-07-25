import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { confirmWorkingDirectoryNavigation, requestWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';

const MAX_RUN_OUTPUT_LINES = 4_000;
const MAX_RUN_OUTPUT_BYTES = 2 * 1024 * 1024;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

const truncateUtf8End = (text: string, maxBytes: number): string => {
  const bytes = utf8Encoder.encode(text);
  if (bytes.length <= maxBytes) return text;
  let start = bytes.length - maxBytes;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return utf8Decoder.decode(bytes.subarray(start));
};

export const trimRepositoryRunOutput = (state: RepositoryRunStateDto): RepositoryRunStateDto => {
  const retained = [] as RepositoryRunStateDto['output'];
  let retainedBytes = 0;
  for (let index = state.output.length - 1; index >= 0 && retained.length < MAX_RUN_OUTPUT_LINES; index -= 1) {
    const line = state.output[index];
    const availableBytes = MAX_RUN_OUTPUT_BYTES - retainedBytes;
    if (availableBytes <= 0) break;
    const text = truncateUtf8End(line.text, availableBytes);
    const textBytes = utf8Encoder.encode(text).length;
    retained.push(text === line.text ? line : { ...line, text });
    retainedBytes += textBytes;
  }
  retained.reverse();
  return { ...state, output: retained };
};

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
    void repositoryRunClient.watchConfig(activeRepo);
  }, [activeRepo]);

  useEffect(() => {
    if (!repositoryRunClient.isAvailable()) return;
    return repositoryRunClient.onConfigChanged((repositoryPath) => {
      if (repositoryPath === activeRepoRef.current) void refreshConfig(repositoryPath);
    });
  }, [refreshConfig]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshConfig();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshConfig]);

  useEffect(() => {
    if (!repositoryRunClient.isAvailable()) return;
    let active = true;
    void repositoryRunClient.getState().then((result) => {
      if (active && result.success) setRunState(result.data ? trimRepositoryRunOutput(result.data) : null);
    });
    return repositoryRunClient.onEvent((event) => {
      if (!active) return;
      if (event.type === 'state') {
        setRunState(event.state ? trimRepositoryRunOutput(event.state) : null);
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
        return trimRepositoryRunOutput({ ...previous, output: [...previous.output, event.line] });
      });
    });
  }, [refreshConfig, triggerRefresh]);

  const startRun = useCallback(
    async (action: RepositoryRunActionId): Promise<boolean> => {
      if (!activeRepo || !repositoryRunClient.isAvailable()) return false;
      if (!(await confirmWorkingDirectoryNavigation({ kind: 'view', label: 'run console' }))) return false;
      const result = await repositoryRunClient.start(activeRepo, action);
      if (!result.success) return false;
      setRunState(trimRepositoryRunOutput(result.data));
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
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'run console' }, () => {
      if (runState.status !== 'running') setLastViewedRunId(runState.runId);
      isConsoleOpenRef.current = true;
      setConsoleOpen(true);
    });
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
