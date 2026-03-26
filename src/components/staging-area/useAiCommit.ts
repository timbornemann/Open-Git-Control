import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '../../types/git';
import { useI18n } from '../../i18n';
import type { GitStatusWithConflicts } from './types';

const AI_STATE_POLL_INTERVAL_MS = 500;
const LIVE_REFRESH_MIN_INTERVAL_MS = 1_200;

type Params = {
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
};

type AiJobStatus = 'idle' | 'start' | 'progress' | 'done' | 'failed' | 'cancelled';

type AiJobEvent = {
  operation?: unknown;
  status?: unknown;
  message?: unknown;
  details?: Record<string, unknown>;
  timestamp?: unknown;
};

const asNumber = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const asString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value : null
);

export const useAiCommit = ({ status, setToast, refresh, onRepoChanged }: Params) => {
  const { tr } = useI18n();
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

  const aiStartLockRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const lastKnownStatusRef = useRef<AiJobStatus>('idle');
  const lastEventTimestampRef = useRef(0);
  const lastRefreshAtRef = useRef(0);

  const maybeRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < LIVE_REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    void refresh();
  }, [refresh]);

  const applyAiJobEvent = useCallback((eventRaw: AiJobEvent | null | undefined) => {
    if (!eventRaw || eventRaw.operation !== 'git:aiAutoCommit') return;

    const eventTimestamp = asNumber(eventRaw.timestamp) ?? Date.now();
    if (eventTimestamp < lastEventTimestampRef.current) {
      return;
    }
    lastEventTimestampRef.current = eventTimestamp;

    const details = (eventRaw.details && typeof eventRaw.details === 'object') ? eventRaw.details : {};
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
    if (remainingFiles !== null) setAiRemainingFiles(remainingFiles);
    if (processedFiles !== null) setAiProcessedFiles(processedFiles);
    if (groupId !== null) setAiGroupId(groupId);
    if (groupSize !== null) setAiGroupSize(groupSize);
    if (totalCommits !== null) setAiTotalCommits(totalCommits);

    const statusValue = asString(eventRaw.status);
    if (statusValue === 'start' || statusValue === 'progress') {
      lastKnownStatusRef.current = statusValue;
      setIsAiCommitting(true);
      setIsAiJobRunning(true);
      setAiProgressMessage(asString(eventRaw.message) || tr('KI arbeitet...', 'AI is working...'));
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
        setAiProgressMessage(asString(eventRaw.message) || tr('KI Auto-Commit abgeschlossen.', 'AI auto-commit completed.'));
      } else if (statusValue === 'cancelled') {
        setAiProgressMessage(asString(eventRaw.message) || tr('KI Auto-Commit abgebrochen.', 'AI auto-commit cancelled.'));
      } else {
        setAiProgressMessage(asString(eventRaw.message) || tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.'));
      }

      lastRefreshAtRef.current = Date.now();
      void refresh();
    }
  }, [maybeRefresh, refresh, tr]);

  const pullLatestAiState = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.getAiAutoCommitState();
      if (!result?.success || !result.data) return;
      applyAiJobEvent(result.data as AiJobEvent);
    } catch {
      // ignore transient polling failures
    }
  }, [applyAiJobEvent]);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubscribe = window.electronAPI.onJobEvent((event) => applyAiJobEvent(event as AiJobEvent));
    return unsubscribe;
  }, [applyAiJobEvent]);

  useEffect(() => {
    void pullLatestAiState();
  }, [pullLatestAiState]);

  useEffect(() => {
    if (!window.electronAPI) return;
    if (!isAiCommitting && !isAiJobRunning) return;

    const intervalId = window.setInterval(() => {
      void pullLatestAiState();
    }, AI_STATE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAiCommitting, isAiJobRunning, pullLatestAiState]);

  const handleAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI || !status) return;
    if (aiStartLockRef.current || isAiCommitting || isAiJobRunning) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: tr('Bitte zuerst alle Konflikte aufloesen.', 'Please resolve all conflicts first.'), isError: true });
      return;
    }

    const totalFiles = status.staged.length + status.unstaged.length + status.untracked.length;
    if (totalFiles === 0) {
      setToast({ msg: tr('Keine Aenderungen fuer KI Auto-Commit vorhanden.', 'No changes available for AI auto-commit.'), isError: true });
      return;
    }

    cancelRequestedRef.current = false;
    aiStartLockRef.current = true;
    lastKnownStatusRef.current = 'start';
    lastEventTimestampRef.current = Date.now() - 1;
    lastRefreshAtRef.current = 0;

    setAiPhase('snapshot');
    setAiMode('normal');
    setAiLastCommit(null);
    setAiGroupId(null);
    setAiGroupSize(null);
    setAiTotalCommits(null);
    setAiProcessedFiles(0);
    setAiRemainingFiles(totalFiles);
    setAiProgressMessage(tr('KI startet...', 'AI is starting...'));
    setIsAiCommitting(true);
    setIsAiJobRunning(true);
    maybeRefresh();

    try {
      const result = await window.electronAPI.runAiAutoCommit();
      if (cancelRequestedRef.current) return;

      if (!result.success) {
        const errorMessage = result.error || tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.');
        const cancelled = /abgebrochen|cancel/i.test(errorMessage);
        setToast({ msg: errorMessage, isError: !cancelled });
        lastKnownStatusRef.current = cancelled ? 'cancelled' : 'failed';
        setAiPhase(cancelled ? 'cancelled' : 'failed');
        setAiProgressMessage(errorMessage);
        setIsAiJobRunning(false);
        await refresh();
        return;
      }

      const commits = result.data.commits || [];
      const warnings = result.data.warnings || [];
      const diagnostics = result.data.diagnostics || [];

      if (commits.length === 0) {
        setToast({
          msg: result.data.summary || tr('KI hat keine Commits erstellt.', 'AI did not create commits.'),
          isError: false,
        });
      } else {
        const list = commits
          .map((commit: { hash: string; subject: string }) => `${commit.hash} ${commit.subject}`)
          .join(' | ');
        const extra = warnings.length > 0 ? tr(` | Hinweise: ${warnings.length}`, ` | Warnings: ${warnings.length}`) : '';
        setToast({ msg: tr(`KI Commit(s): ${list}${extra}`, `AI commit(s): ${list}${extra}`), isError: false });
      }

      if (diagnostics.length > 0) {
        console.info('AI Auto-Commit diagnostics:', diagnostics);
      }

      if (onRepoChanged) onRepoChanged();
      await refresh();

      if (!['done', 'failed', 'cancelled'].includes(lastKnownStatusRef.current)) {
        lastKnownStatusRef.current = 'done';
        setAiPhase('done');
        setAiProgressMessage(result.data.summary || tr('KI Auto-Commit abgeschlossen.', 'AI auto-commit completed.'));
      }
      setIsAiJobRunning(false);
    } catch (error: unknown) {
      if (cancelRequestedRef.current) return;

      const message = error instanceof Error
        ? error.message
        : tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.');

      const cancelled = /abgebrochen|cancel/i.test(message);
      setToast({ msg: message, isError: !cancelled });
      lastKnownStatusRef.current = cancelled ? 'cancelled' : 'failed';
      setAiPhase(cancelled ? 'cancelled' : 'failed');
      setAiProgressMessage(message);
      setIsAiJobRunning(false);
      await refresh();
    } finally {
      aiStartLockRef.current = false;
      cancelRequestedRef.current = false;
      setIsAiCommitting(false);
    }
  }, [isAiCommitting, isAiJobRunning, maybeRefresh, onRepoChanged, refresh, setToast, status, tr]);

  const handleCancelAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI) return;

    if (!isAiCommitting && !isAiJobRunning) {
      setAiProgressMessage(tr('Kein laufender KI Auto-Commit gefunden.', 'No running AI auto-commit found.'));
      return;
    }

    cancelRequestedRef.current = true;
    setAiProgressMessage(tr('Abbruch angefordert...', 'Cancellation requested...'));
    setIsAiJobRunning(true);

    try {
      const result = await window.electronAPI.cancelAiAutoCommit();
      if (!result.success || !result.canceled) {
        cancelRequestedRef.current = false;
        setIsAiCommitting(false);
        setIsAiJobRunning(false);
        setAiProgressMessage(tr('Kein laufender KI Auto-Commit gefunden.', 'No running AI auto-commit found.'));
        return;
      }

      await pullLatestAiState();
    } catch (error: unknown) {
      cancelRequestedRef.current = false;
      setToast({
        msg: error instanceof Error
          ? error.message
          : tr('KI Auto-Commit konnte nicht abgebrochen werden.', 'Could not cancel AI auto-commit.'),
        isError: true,
      });
    }
  }, [isAiCommitting, isAiJobRunning, pullLatestAiState, setToast, tr]);

  return {
    isAiCommitting,
    isAiJobRunning,
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
  };
};
