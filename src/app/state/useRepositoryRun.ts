import { useResourceState } from '@/data/resourceHooks';
import { invalidateResources, resourceKey } from '@/data/clientCache';
import { updateResource } from '@/data/queryClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { CancelledError } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { confirmWorkingDirectoryNavigation, requestWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';
import { describeRunPrerequisiteError } from '@/shared/repositoryRunPrerequisites';
import type { NotificationController } from '@/types/notifications';

const MAX_RUN_OUTPUT_LINES = 4_000;
const MAX_RUN_OUTPUT_BYTES = 2 * 1024 * 1024;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const outputLineBytes = new WeakMap<RepositoryRunStateDto['output'][number], number>();
const lineBytes = (line: RepositoryRunStateDto['output'][number]) => {
  let bytes = outputLineBytes.get(line);
  if (bytes === undefined) {
    bytes = utf8Encoder.encode(line.text).length;
    outputLineBytes.set(line, bytes);
  }
  return bytes;
};

const truncateUtf8End = (text: string, maxBytes: number): string => {
  const bytes = utf8Encoder.encode(text);
  if (bytes.length <= maxBytes) return text;
  let start = bytes.length - maxBytes;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return utf8Decoder.decode(bytes.subarray(start));
};

const trimRunLines = (output: RepositoryRunStateDto['output']): RepositoryRunStateDto['output'] => {
  const retained = [] as RepositoryRunStateDto['output'];
  let retainedBytes = 0;
  for (let index = output.length - 1; index >= 0 && retained.length < MAX_RUN_OUTPUT_LINES; index -= 1) {
    const line = output[index];
    const availableBytes = MAX_RUN_OUTPUT_BYTES - retainedBytes;
    if (availableBytes <= 0) break;
    const bytes = lineBytes(line);
    const retainedLine = bytes <= availableBytes ? line : { ...line, text: truncateUtf8End(line.text, availableBytes) };
    retained.push(retainedLine);
    retainedBytes += retainedLine === line ? bytes : lineBytes(retainedLine);
  }
  retained.reverse();
  return retained;
};
export const trimRepositoryRunOutput = (state: RepositoryRunStateDto): RepositoryRunStateDto => ({ ...state, output: trimRunLines(state.output) });
const appendRunOutput = (state: RepositoryRunStateDto, lines: RepositoryRunStateDto['output']): RepositoryRunStateDto => {
  const last = state.output.at(-1)?.sequence ?? Number.NEGATIVE_INFINITY;
  const newer = lines.filter((line) => line.sequence > last);
  return newer.length ? { ...state, output: trimRunLines(state.output.concat(newer)) } : state;
};

export const useRepositoryRun = ({
  activeRepo,
  triggerRefresh,
  notify,
  tr = (_de, en) => en,
}: {
  activeRepo: string | null;
  triggerRefresh: () => void;
  notify?: NotificationController['publish'];
  tr?: (de: string, en: string) => string;
}) => {
  const [runState, setRunState] = useState<RepositoryRunStateDto | null>(null);
  const [activeConfig, setActiveConfig] = useResourceState<RepositoryRunConfigStateDto | null>('runs', 'getConfig', [activeRepo], null);
  const [isConsoleOpen, setConsoleOpen] = useState(false);
  const [lastViewedRunId, setLastViewedRunId] = useState<string | null>(null);
  const refreshedRunIds = useRef(new Set<string>());
  const activeRepoRef = useRef(activeRepo);
  const isConsoleOpenRef = useRef(isConsoleOpen);
  const configRequestGenerationRef = useRef(0);
  const startingRef = useRef(false);
  // A run event can arrive between committing a repository switch and its
  // effect. Keep this identity current during render so that event cannot
  // publish configuration from the repository that was just left.
  activeRepoRef.current = activeRepo;

  useEffect(() => {
    configRequestGenerationRef.current += 1;
    isConsoleOpenRef.current = false;
    setConsoleOpen(false);
  }, [activeRepo]);

  const refreshConfig = useCallback(
    async (requestedRepoPath?: string) => {
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
      try {
        const result = await repositoryRunClient.getConfig(repoPath);
        if (requestGeneration !== configRequestGenerationRef.current || repoPath !== activeRepoRef.current) return;
        if (result.success) setActiveConfig(result.data);
      } catch (error) {
        // Watcher invalidation, repository changes and Strict Mode can cancel
        // a cold read before it has cached data. Its replacement owns the result.
        if (!(error instanceof CancelledError)) throw error;
      }
    },
    [setActiveConfig],
  );

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
      invalidateResources('runs', normalizeRepoPathKey(repositoryPath), ['getConfig']);
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
    let receivedState = false;
    let initialReadPending = true;
    let earlyOutput: { runId: string; lines: RepositoryRunStateDto['output'] } | null = null;
    void repositoryRunClient
      .getState()
      .then((result) => {
        if (!active || receivedState || !result.success) return;
        const buffered = earlyOutput;
        const snapshot = result.data ? trimRepositoryRunOutput(result.data) : null;
        setRunState((previous) => {
          if (!snapshot) return null;
          let state = snapshot;
          if (previous?.runId === snapshot.runId) {
            if (previous.status !== 'running' && snapshot.status === 'running') state = previous;
            state = appendRunOutput(state, previous.output);
          }
          return buffered?.runId === state.runId ? appendRunOutput(state, buffered.lines) : state;
        });
      })
      .catch(() => {
        /* A newer run event can supersede this initial read. */
      })
      .finally(() => {
        initialReadPending = false;
        earlyOutput = null;
      });
    const unsubscribe = repositoryRunClient.onEvent((event) => {
      if (!active) return;
      if (event.type === 'state') {
        receivedState = true;
        earlyOutput = null;
        const state = event.state ? trimRepositoryRunOutput(event.state) : null;
        updateResource(resourceKey('runs', 'getState'), { success: true, data: state });
        setRunState(state);
        if (event.state && event.state.status !== 'running' && !refreshedRunIds.current.has(event.state.runId)) {
          if (isConsoleOpenRef.current && event.state.repoPath === activeRepoRef.current) setLastViewedRunId(event.state.runId);
          refreshedRunIds.current.add(event.state.runId);
          invalidateResources('git', normalizeRepoPathKey(event.state.repoPath));
          triggerRefresh();
          void refreshConfig(event.state.repoPath);
        }
        return;
      }
      const lines = event.type === 'output-batch' ? event.lines : [event.line];
      if (initialReadPending && !receivedState) {
        const prior = earlyOutput?.runId === event.runId ? earlyOutput.lines : [];
        earlyOutput = { runId: event.runId, lines: trimRunLines(prior.concat(lines)) };
      }
      setRunState((previous) => {
        if (!previous || previous.runId !== event.runId) return previous;
        return appendRunOutput(previous, lines);
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshConfig, triggerRefresh]);

  const startRun = useCallback(
    async function startRun(action: RepositoryRunActionId): Promise<boolean> {
      if (!activeRepo || !repositoryRunClient.isAvailable() || startingRef.current) return false;
      startingRef.current = true;
      try {
        if (!(await confirmWorkingDirectoryNavigation({ kind: 'view', label: 'run console' })) || activeRepo !== activeRepoRef.current) return false;
        const result = await repositoryRunClient.start(activeRepo, action);
        if (!result.success) {
          if (activeRepo !== activeRepoRef.current) return false;
          const explanation = describeRunPrerequisiteError(result.error, tr);
          notify?.({
            msg: explanation ?? result.error,
            isError: true,
            title: tr('Befehl konnte nicht gestartet werden', 'Command could not be started'),
            errorExplained: true,
            ...(explanation
              ? {
                  actions: [
                    {
                      label: tr('Erneut prüfen und starten', 'Check again and start'),
                      onClick: () => {
                        if (activeRepo === activeRepoRef.current) void startRun(action);
                      },
                    },
                  ],
                }
              : {}),
          });
          void refreshConfig(activeRepo);
          return false;
        }
        setRunState((previous) => (previous?.runId === result.data.runId ? previous : trimRepositoryRunOutput(result.data)));
        if (activeRepo !== activeRepoRef.current) return false;
        isConsoleOpenRef.current = true;
        setConsoleOpen(true);
        return true;
      } catch (error) {
        if (activeRepo === activeRepoRef.current)
          notify?.({
            msg: error instanceof Error ? error.message : tr('Befehl konnte nicht gestartet werden.', 'Command could not be started.'),
            isError: true,
            errorExplained: true,
          });
        return false;
      } finally {
        startingRef.current = false;
      }
    },
    [activeRepo, notify, tr, refreshConfig],
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
