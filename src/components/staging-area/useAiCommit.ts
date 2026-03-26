import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '../../types/git';
import { useI18n } from '../../i18n';
import type { GitStatusWithConflicts } from './types';

const AI_LOCAL_STATE_EVENT = 'ai:auto-commit-local-state';
const CANCEL_IPC_TIMEOUT_MS = 4_000;
const CANCEL_FORCE_COMPLETE_MS = 8_000;

type Params = {
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
};

export const useAiCommit = ({ status, setToast, refresh, onRepoChanged }: Params) => {
  const { tr } = useI18n();
  const [isAiCommitting, setIsAiCommitting] = useState(false);
  const [isAiJobRunning, setIsAiJobRunning] = useState(false);
  const [aiProgressMessage, setAiProgressMessage] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<string>('idle');
  const [aiMode, setAiMode] = useState<string>('normal');
  const [aiLastCommit, setAiLastCommit] = useState<string | null>(null);
  const [aiRemainingFiles, setAiRemainingFiles] = useState<number | null>(null);
  const aiStartLockRef = useRef(false);
  const aiInvokeSeqRef = useRef(0);
  const cancelRequestedRef = useRef(false);
  const backendJobSeenRef = useRef(false);
  const suppressNonTerminalEventsRef = useRef(false);
  const cancelForceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitLocalRunningState = useCallback((running: boolean) => {
    window.dispatchEvent(new CustomEvent(AI_LOCAL_STATE_EVENT, { detail: { running } }));
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onJobEvent((event) => {
      if (event.operation !== 'git:aiAutoCommit') return;

      const details = event.details || {};
      const phase = typeof details.phase === 'string' ? details.phase : null;
      const mode = typeof details.mode === 'string' ? details.mode : null;
      const lastCommit = typeof details.lastCommit === 'string' ? details.lastCommit : null;
      const remaining = typeof details.remainingFiles === 'number' ? details.remainingFiles : null;

      if (phase) setAiPhase(phase);
      if (mode) setAiMode(mode);
      if (lastCommit) setAiLastCommit(lastCommit);
      if (remaining !== null) setAiRemainingFiles(remaining);

      if (suppressNonTerminalEventsRef.current && (event.status === 'start' || event.status === 'progress')) {
        return;
      }

      if (event.status === 'start' || event.status === 'progress') {
        if (cancelRequestedRef.current) {
          setAiProgressMessage(tr('Abbruch wird ausgefuehrt...', 'Cancellation in progress...'));
          setAiPhase('cancelled');
          return;
        }
        backendJobSeenRef.current = true;
        setIsAiJobRunning(true);
        setAiProgressMessage(event.message || tr('KI arbeitet...', 'AI is working...'));
        emitLocalRunningState(true);
        return;
      }

      if (event.status === 'done') {
        if (cancelForceTimerRef.current) {
          clearTimeout(cancelForceTimerRef.current);
          cancelForceTimerRef.current = null;
        }
        backendJobSeenRef.current = false;
        cancelRequestedRef.current = false;
        suppressNonTerminalEventsRef.current = false;
        aiStartLockRef.current = false;
        setIsAiJobRunning(false);
        setIsAiCommitting(false);
        setAiProgressMessage(event.message || tr('KI Auto-Commit abgeschlossen.', 'AI auto-commit completed.'));
        emitLocalRunningState(false);
        return;
      }

      if (event.status === 'failed') {
        if (cancelForceTimerRef.current) {
          clearTimeout(cancelForceTimerRef.current);
          cancelForceTimerRef.current = null;
        }
        backendJobSeenRef.current = false;
        cancelRequestedRef.current = false;
        suppressNonTerminalEventsRef.current = false;
        aiStartLockRef.current = false;
        setIsAiJobRunning(false);
        setIsAiCommitting(false);
        setAiProgressMessage(event.message || tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.'));
        emitLocalRunningState(false);
        return;
      }

      if (event.status === 'cancelled') {
        if (cancelForceTimerRef.current) {
          clearTimeout(cancelForceTimerRef.current);
          cancelForceTimerRef.current = null;
        }
        backendJobSeenRef.current = false;
        cancelRequestedRef.current = false;
        suppressNonTerminalEventsRef.current = false;
        aiStartLockRef.current = false;
        setIsAiJobRunning(false);
        setIsAiCommitting(false);
        setAiProgressMessage(event.message || tr('KI Auto-Commit abgebrochen.', 'AI auto-commit cancelled.'));
        emitLocalRunningState(false);
      }
    });

    return unsubscribe;
  }, [emitLocalRunningState, tr]);

  useEffect(() => {
    return () => {
      if (cancelForceTimerRef.current) {
        clearTimeout(cancelForceTimerRef.current);
        cancelForceTimerRef.current = null;
      }
    };
  }, []);

  const handleAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI || !status || aiStartLockRef.current) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: tr('Bitte zuerst alle Konflikte aufloesen.', 'Please resolve all conflicts first.'), isError: true });
      return;
    }

    if (status.staged.length + status.unstaged.length + status.untracked.length === 0) {
      setToast({ msg: tr('Keine Aenderungen fuer KI Auto-Commit vorhanden.', 'No changes available for AI auto-commit.'), isError: true });
      return;
    }
    setAiPhase('snapshot');
    setAiMode('normal');
    setAiLastCommit(null);
    setAiRemainingFiles(status.staged.length + status.unstaged.length + status.untracked.length);
    setIsAiJobRunning(true);
    setAiProgressMessage(tr('KI startet...', 'AI is starting...'));
    emitLocalRunningState(true);
    aiInvokeSeqRef.current += 1;
    const invokeSeq = aiInvokeSeqRef.current;
    cancelRequestedRef.current = false;
    backendJobSeenRef.current = false;
    suppressNonTerminalEventsRef.current = false;
    aiStartLockRef.current = true;
    setIsAiCommitting(true);
    try {
      const result = await window.electronAPI.runAiAutoCommit();
      if (invokeSeq !== aiInvokeSeqRef.current || cancelRequestedRef.current) {
        return;
      }

      if (!result.success) {
        setToast({ msg: result.error || tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.'), isError: true });
        return;
      }

      const commits = result.data.commits || [];
      const warnings = result.data.warnings || [];
      const diagnostics = result.data.diagnostics || [];

      if (commits.length === 0) {
        setToast({ msg: result.data.summary || tr('KI hat keine Commits erstellt.', 'AI did not create commits.'), isError: false });
      } else {
        const list = commits.map((commit: { hash: string; subject: string }) => `${commit.hash} ${commit.subject}`).join(' | ');
        const extra = warnings.length > 0 ? tr(` | Hinweise: ${warnings.length}`, ` | Warnings: ${warnings.length}`) : '';
        setToast({ msg: tr(`KI Commit(s): ${list}${extra}`, `AI commit(s): ${list}${extra}`), isError: false });
      }

      if (diagnostics.length > 0) {
        console.info('AI Auto-Commit diagnostics:', diagnostics);
      }
      if (onRepoChanged) onRepoChanged();
      await refresh();
    } catch (error: unknown) {
      if (invokeSeq !== aiInvokeSeqRef.current || cancelRequestedRef.current) {
        return;
      }
      setToast({ msg: error instanceof Error ? error.message : tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.'), isError: true });
    } finally {
      if (invokeSeq === aiInvokeSeqRef.current) {
        aiStartLockRef.current = false;
        setIsAiCommitting(false);
        if (!backendJobSeenRef.current) {
          setIsAiJobRunning(false);
          emitLocalRunningState(false);
        }
      }
    }
  }, [emitLocalRunningState, status, setToast, refresh, onRepoChanged, tr]);

  const handleCancelAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI) return;

    cancelRequestedRef.current = true;
    suppressNonTerminalEventsRef.current = true;
    aiInvokeSeqRef.current += 1;
    aiStartLockRef.current = false;
    setIsAiCommitting(false);
    setIsAiJobRunning(true);
    setAiPhase('cancelled');
    setAiProgressMessage(tr('Abbruch angefordert...', 'Cancellation requested...'));
    emitLocalRunningState(true);

    if (cancelForceTimerRef.current) {
      clearTimeout(cancelForceTimerRef.current);
      cancelForceTimerRef.current = null;
    }
    cancelForceTimerRef.current = setTimeout(() => {
      if (!cancelRequestedRef.current) return;
      cancelRequestedRef.current = false;
      backendJobSeenRef.current = false;
      suppressNonTerminalEventsRef.current = true;
      setIsAiJobRunning(false);
      setIsAiCommitting(false);
      setAiPhase('cancelled');
      setAiProgressMessage(tr('Abbruch lokal abgeschlossen.', 'Cancellation completed locally.'));
      emitLocalRunningState(false);
    }, CANCEL_FORCE_COMPLETE_MS);

    try {
      const timeout = new Promise<{ success: false; canceled: false }>((resolve) => {
        setTimeout(() => resolve({ success: false, canceled: false }), CANCEL_IPC_TIMEOUT_MS);
      });
      const result = await Promise.race([window.electronAPI.cancelAiAutoCommit(), timeout]);
      if (result.success && result.canceled) {
        setAiProgressMessage(tr('Abbruch wird ausgefuehrt...', 'Cancellation in progress...'));
      } else {
        setAiProgressMessage(tr('Kein laufender KI Auto-Commit gefunden.', 'No running AI auto-commit found.'));
      }
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : tr('KI Auto-Commit konnte nicht abgebrochen werden.', 'Could not cancel AI auto-commit.'), isError: true });
    }
  }, [emitLocalRunningState, setToast, tr]);

  return {
    isAiCommitting,
    isAiJobRunning,
    aiProgressMessage,
    aiPhase,
    aiMode,
    aiLastCommit,
    aiRemainingFiles,
    handleAiAutoCommit,
    handleCancelAiAutoCommit,
  };
};
