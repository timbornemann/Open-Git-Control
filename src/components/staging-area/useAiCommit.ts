import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '@/types/git';
import type { AiAutoCommitResultDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { aiClient } from '@/services/aiClient';
import type { GitStatusWithConflicts } from './types';

const AI_STATE_POLL_INTERVAL_MS = 500;
const LIVE_REFRESH_MIN_INTERVAL_MS = 1_200;
const AI_TERMINAL_CLEAR_DELAY_MS = 4_000;

type Params = {
  repoPath: string | null;
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
  onCommitsCreated?: () => void;
};

type AiJobStatus = 'idle' | 'start' | 'progress' | 'done' | 'failed' | 'cancelled';

type AiJobEvent = {
  operation?: unknown;
  status?: unknown;
  message?: unknown;
  details?: Record<string, unknown>;
  timestamp?: unknown;
};

type GeneratedCommitMessage = {
  title: string;
  description: string;
};

const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value : null);

export const useAiCommit = ({ repoPath, status, setToast, refresh, onRepoChanged, onCommitsCreated }: Params) => {
  const { t, tr } = useI18n();
  const [isAiCommitting, setIsAiCommitting] = useState(false);
  const [isAiJobRunning, setIsAiJobRunning] = useState(false);
  const [aiProgressMessage, setAiProgressMessage] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<string>('idle');
  const [aiMode, setAiMode] = useState<string>('normal');
  const [aiLastCommit, setAiLastCommit] = useState<string | null>(null);
  const [aiRemainingFiles, setAiRemainingFiles] = useState<number | null>(null);
  const [aiProcessedFiles, setAiProcessedFiles] = useState<number | null>(null);
  const [aiGroupId, setAiGroupId] = useState<number | null>(null);
  const [aiGroupSize, setAiGroupSize] = useState<number | null>(null);
  const [aiTotalCommits, setAiTotalCommits] = useState<number | null>(null);
  const [isAiMessageGenerating, setIsAiMessageGenerating] = useState(false);

  const aiStartLockRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const lastKnownStatusRef = useRef<AiJobStatus>('idle');
  const lastEventTimestampRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const aiTotalFilesRef = useRef<number | null>(null);
  const terminalClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repoPathRef = useRef<string | null>(repoPath);
  const runGenerationRef = useRef(0);

  const clearTerminalClearTimer = useCallback(() => {
    if (!terminalClearTimerRef.current) return;
    clearTimeout(terminalClearTimerRef.current);
    terminalClearTimerRef.current = null;
  }, []);

  const resetAiProgressUi = useCallback(() => {
    setAiProgressMessage(null);
    setAiPhase('idle');
    setAiMode('normal');
    setAiLastCommit(null);
    setAiRemainingFiles(null);
    setAiProcessedFiles(null);
    setAiGroupId(null);
    setAiGroupSize(null);
    setAiTotalCommits(null);
    aiTotalFilesRef.current = null;
  }, []);

  const scheduleTerminalClear = useCallback(() => {
    clearTerminalClearTimer();
    terminalClearTimerRef.current = setTimeout(() => {
      resetAiProgressUi();
    }, AI_TERMINAL_CLEAR_DELAY_MS);
  }, [clearTerminalClearTimer, resetAiProgressUi]);

  const maybeRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < LIVE_REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    void refresh();
  }, [refresh]);

  const applyAiJobEvent = useCallback(
    (eventRaw: AiJobEvent | null | undefined) => {
      if (!eventRaw || eventRaw.operation !== 'git:aiAutoCommit') return;

      const details = eventRaw.details && typeof eventRaw.details === 'object' ? eventRaw.details : {};
      const eventRepoPath = asString(details.repoPath);
      if (eventRepoPath && repoPathRef.current && eventRepoPath !== repoPathRef.current) {
        return;
      }

      const eventTimestamp = asNumber(eventRaw.timestamp) ?? Date.now();
      if (eventTimestamp < lastEventTimestampRef.current) {
        return;
      }
      lastEventTimestampRef.current = eventTimestamp;

      const phase = asString(details.phase);
      const mode = asString(details.mode);
      const lastCommit = asString(details.lastCommit);
      const remainingFiles = asNumber(details.remainingFiles);
      const processedFiles = asNumber(details.processedFiles);
      const groupId = asNumber(details.groupId);
      const groupSize = asNumber(details.groupSize);
      const totalCommits = asNumber(details.totalCommits);

      if (phase) setAiPhase(phase);
      if (mode) setAiMode(mode);
      if (lastCommit) setAiLastCommit(lastCommit);
      if (remainingFiles !== null) {
        if (aiTotalFilesRef.current === null && processedFiles === null) {
          aiTotalFilesRef.current = remainingFiles;
        }
        setAiRemainingFiles(remainingFiles);
        if (aiTotalFilesRef.current !== null) {
          const derivedProcessed = Math.max(0, aiTotalFilesRef.current - remainingFiles);
          setAiProcessedFiles(derivedProcessed);
        }
      }
      if (processedFiles !== null) {
        const shouldPreferExplicit = phase === 'done' || aiTotalFilesRef.current === null;
        if (shouldPreferExplicit) {
          setAiProcessedFiles(processedFiles);
        }
      }
      if (groupId !== null) setAiGroupId(groupId);
      if (groupSize !== null) setAiGroupSize(groupSize);
      if (totalCommits !== null) setAiTotalCommits(totalCommits);

      const statusValue = asString(eventRaw.status);
      if (statusValue === 'start' || statusValue === 'progress') {
        clearTerminalClearTimer();
        lastKnownStatusRef.current = statusValue;
        setIsAiCommitting(true);
        setIsAiJobRunning(true);
        setAiProgressMessage(asString(eventRaw.message) || t('generated.components.staging_area.stagingcommitpanel.ai_is_working_2f3bf7e0'));
        maybeRefresh();
        return;
      }

      if (statusValue === 'done' || statusValue === 'failed' || statusValue === 'cancelled') {
        lastKnownStatusRef.current = statusValue;
        cancelRequestedRef.current = false;
        aiStartLockRef.current = false;
        setIsAiCommitting(false);
        setIsAiJobRunning(false);

        if (statusValue === 'done') {
          setAiProgressMessage(asString(eventRaw.message) || t('generated.components.staging_area.useaicommit.ai_auto_commit_completed_671832fb'));
        } else if (statusValue === 'cancelled') {
          setAiProgressMessage(asString(eventRaw.message) || t('generated.components.staging_area.useaicommit.ai_auto_commit_cancelled_dace648f'));
        } else {
          setAiProgressMessage(asString(eventRaw.message) || t('generated.components.staging_area.useaicommit.ai_auto_commit_failed_f42b2375'));
        }

        lastRefreshAtRef.current = Date.now();
        void refresh();
        scheduleTerminalClear();
      }
    },
    [clearTerminalClearTimer, maybeRefresh, refresh, scheduleTerminalClear, t],
  );

  useEffect(() => {
    repoPathRef.current = repoPath;
    runGenerationRef.current += 1;
    cancelRequestedRef.current = false;
    aiStartLockRef.current = false;
    lastEventTimestampRef.current = 0;
    setIsAiCommitting(false);
    setIsAiJobRunning(false);
    setIsAiMessageGenerating(false);
    clearTerminalClearTimer();
    resetAiProgressUi();
  }, [clearTerminalClearTimer, repoPath, resetAiProgressUi]);

  const pullLatestAiState = useCallback(async () => {
    if (!aiClient.isAvailable()) return;
    try {
      const result = await aiClient.getAutoCommitState();
      if (!result?.success || !result.data) return;
      applyAiJobEvent(result.data as AiJobEvent);
    } catch {
      // ignore transient polling failures
    }
  }, [applyAiJobEvent]);

  useEffect(() => {
    if (!aiClient.isAvailable()) return;
    const unsubscribe = aiClient.onJobEvent((event) => applyAiJobEvent(event as AiJobEvent));
    return unsubscribe;
  }, [applyAiJobEvent]);

  useEffect(() => {
    void pullLatestAiState();
  }, [pullLatestAiState]);

  useEffect(() => {
    if (!aiClient.isAvailable()) return;
    if (!isAiCommitting && !isAiJobRunning) return;

    const intervalId = window.setInterval(() => {
      void pullLatestAiState();
    }, AI_STATE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAiCommitting, isAiJobRunning, pullLatestAiState]);

  useEffect(
    () => () => {
      clearTerminalClearTimer();
    },
    [clearTerminalClearTimer],
  );

  const handleAiRunFailure = useCallback(
    async (message: string) => {
      const cancelled = /abgebrochen|cancel/i.test(message);
      setToast({ msg: message, isError: !cancelled });
      lastKnownStatusRef.current = cancelled ? 'cancelled' : 'failed';
      setAiPhase(cancelled ? 'cancelled' : 'failed');
      setAiProgressMessage(message);
      setIsAiJobRunning(false);
      await refresh();
      scheduleTerminalClear();
    },
    [refresh, scheduleTerminalClear, setToast],
  );

  const handleAiRunSuccess = useCallback(
    async (data: AiAutoCommitResultDto) => {
      const commits = data.commits || [];
      const warnings = data.warnings || [];
      const diagnostics = data.diagnostics || [];

      if (commits.length === 0) {
        setToast({
          msg: data.summary || t('generated.components.staging_area.useaicommit.ai_did_not_create_commits_fa18e8e4'),
          isError: false,
        });
      } else {
        const list = commits.map((commit) => `${commit.hash} ${commit.subject}`).join(' | ');
        const extra = warnings.length > 0 ? tr(` | Hinweise: ${warnings.length}`, ` | Warnings: ${warnings.length}`) : '';
        setToast({ msg: tr(`KI Commit(s): ${list}${extra}`, `AI commit(s): ${list}${extra}`), isError: false });
      }

      if (diagnostics.length > 0) {
        console.info('AI Auto-Commit diagnostics:', diagnostics);
      }

      if (onCommitsCreated) onCommitsCreated();
      else if (onRepoChanged) onRepoChanged();
      await refresh();

      if (!['done', 'failed', 'cancelled'].includes(lastKnownStatusRef.current)) {
        lastKnownStatusRef.current = 'done';
        setAiPhase('done');
        setAiProgressMessage(data.summary || t('generated.components.staging_area.useaicommit.ai_auto_commit_completed_671832fb'));
      }
      setIsAiJobRunning(false);
      scheduleTerminalClear();
    },
    [onCommitsCreated, onRepoChanged, refresh, scheduleTerminalClear, setToast, t, tr],
  );

  const handleAiAutoCommit = useCallback(async () => {
    if (!aiClient.isAvailable() || !status || !repoPath) return;
    if (aiStartLockRef.current || isAiCommitting || isAiJobRunning) return;
    const generation = runGenerationRef.current;

    if (status.conflicts.length > 0) {
      setToast({ msg: t('generated.components.staging_area.useaicommit.please_resolve_all_conflicts_first_9e29c688'), isError: true });
      return;
    }

    const totalFiles = status.staged.length + status.unstaged.length + status.untracked.length;
    if (totalFiles === 0) {
      setToast({ msg: t('generated.components.staging_area.useaicommit.no_changes_available_for_ai_auto_commit_b9e2c2bc'), isError: true });
      return;
    }

    clearTerminalClearTimer();
    cancelRequestedRef.current = false;
    aiStartLockRef.current = true;
    lastKnownStatusRef.current = 'start';
    lastEventTimestampRef.current = Date.now() - 1;
    lastRefreshAtRef.current = 0;
    aiTotalFilesRef.current = totalFiles;

    setAiPhase('snapshot');
    setAiMode('normal');
    setAiLastCommit(null);
    setAiGroupId(null);
    setAiGroupSize(null);
    setAiTotalCommits(null);
    setAiProcessedFiles(0);
    setAiRemainingFiles(totalFiles);
    setAiProgressMessage(t('generated.components.staging_area.useaicommit.ai_is_starting_e50f32f8'));
    setIsAiCommitting(true);
    setIsAiJobRunning(true);
    maybeRefresh();

    try {
      const result = await aiClient.runAutoCommit({ repoPath });
      if (generation !== runGenerationRef.current || repoPathRef.current !== repoPath) return;
      if (cancelRequestedRef.current) return;

      if (!result.success) {
        const errorMessage = result.error || t('generated.components.staging_area.useaicommit.ai_auto_commit_failed_f42b2375');
        await handleAiRunFailure(errorMessage);
        return;
      }

      await handleAiRunSuccess(result.data);
    } catch (error: unknown) {
      if (generation !== runGenerationRef.current || repoPathRef.current !== repoPath) return;
      if (cancelRequestedRef.current) return;

      const message = error instanceof Error ? error.message : t('generated.components.staging_area.useaicommit.ai_auto_commit_failed_f42b2375');

      await handleAiRunFailure(message);
    } finally {
      if (generation === runGenerationRef.current && repoPathRef.current === repoPath) {
        aiStartLockRef.current = false;
        cancelRequestedRef.current = false;
        setIsAiCommitting(false);
      }
    }
  }, [repoPath, status, isAiCommitting, isAiJobRunning, clearTerminalClearTimer, handleAiRunFailure, handleAiRunSuccess, t, maybeRefresh, setToast]);

  const handleCancelAiAutoCommit = useCallback(async () => {
    if (!aiClient.isAvailable()) return;

    if (!isAiCommitting && !isAiJobRunning) {
      setAiProgressMessage(t('generated.components.staging_area.useaicommit.no_running_ai_auto_commit_found_2b61aefa'));
      return;
    }

    cancelRequestedRef.current = true;
    setAiProgressMessage(t('generated.components.staging_area.useaicommit.cancellation_requested_c2ba3e99'));
    setIsAiJobRunning(true);

    try {
      const result = await aiClient.cancelAutoCommit();
      if (!result.success || !result.canceled) {
        cancelRequestedRef.current = false;
        setIsAiCommitting(false);
        setIsAiJobRunning(false);
        setAiProgressMessage(t('generated.components.staging_area.useaicommit.no_running_ai_auto_commit_found_2b61aefa'));
        scheduleTerminalClear();
        return;
      }

      await pullLatestAiState();
    } catch (error: unknown) {
      cancelRequestedRef.current = false;
      setToast({
        msg: error instanceof Error ? error.message : t('generated.components.staging_area.useaicommit.could_not_cancel_ai_auto_commit_98ec4d8d'),
        isError: true,
      });
    }
  }, [isAiCommitting, isAiJobRunning, pullLatestAiState, scheduleTerminalClear, setToast, t]);

  const generateCommitMessageFromNotes = useCallback(
    async (notes: string): Promise<GeneratedCommitMessage | null> => {
      if (!aiClient.isAvailable()) return null;
      const generation = runGenerationRef.current;

      const normalizedNotes = notes.trim();
      if (!normalizedNotes) {
        setToast({ msg: t('generated.components.staging_area.useaicommit.please_describe_the_changes_for_the_commit_message_3c7330a3'), isError: true });
        return null;
      }

      setIsAiMessageGenerating(true);
      try {
        const result = await aiClient.generateCommitMessage({ notes: normalizedNotes });
        if (generation !== runGenerationRef.current) return null;
        if (!result.success) {
          setToast({ msg: result.error || t('generated.components.staging_area.useaicommit.could_not_create_ai_commit_message_ee54707d'), isError: true });
          return null;
        }

        return result.data;
      } catch (error: unknown) {
        if (generation !== runGenerationRef.current) return null;
        setToast({
          msg: error instanceof Error ? error.message : t('generated.components.staging_area.useaicommit.could_not_create_ai_commit_message_ee54707d'),
          isError: true,
        });
        return null;
      } finally {
        if (generation === runGenerationRef.current) {
          setIsAiMessageGenerating(false);
        }
      }
    },
    [setToast, t],
  );

  return {
    isAiCommitting,
    isAiJobRunning,
    isAiMessageGenerating,
    aiProgressMessage,
    aiPhase,
    aiMode,
    aiLastCommit,
    aiRemainingFiles,
    aiProcessedFiles,
    aiGroupId,
    aiGroupSize,
    aiTotalCommits,
    handleAiAutoCommit,
    handleCancelAiAutoCommit,
    generateCommitMessageFromNotes,
  };
};
