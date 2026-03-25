import { useCallback, useEffect, useState } from 'react';
import type { ToastMessage } from '../../types/git';
import type { GitStatusWithConflicts } from './types';

type Params = {
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
};

export const useAiCommit = ({ status, setToast, refresh, onRepoChanged }: Params) => {
  const [isAiCommitting, setIsAiCommitting] = useState(false);
  const [isAiJobRunning, setIsAiJobRunning] = useState(false);
  const [aiProgressMessage, setAiProgressMessage] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<string>('idle');
  const [aiMode, setAiMode] = useState<string>('normal');
  const [aiLastCommit, setAiLastCommit] = useState<string | null>(null);
  const [aiRemainingFiles, setAiRemainingFiles] = useState<number | null>(null);

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

      if (event.status === 'start' || event.status === 'progress') {
        setIsAiJobRunning(true);
        setAiProgressMessage(event.message || 'KI arbeitet...');
        return;
      }

      if (event.status === 'done') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || 'KI Auto-Commit abgeschlossen.');
        return;
      }

      if (event.status === 'failed') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || 'KI Auto-Commit fehlgeschlagen.');
        return;
      }

      if (event.status === 'cancelled') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || 'KI Auto-Commit abgebrochen.');
      }
    });

    return unsubscribe;
  }, []);

  const handleAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: 'Bitte zuerst alle Konflikte aufloesen.', isError: true });
      return;
    }

    if (status.staged.length + status.unstaged.length + status.untracked.length === 0) {
      setToast({ msg: 'Keine Aenderungen fuer KI Auto-Commit vorhanden.', isError: true });
      return;
    }
    setAiPhase('snapshot');
    setAiMode('normal');
    setAiLastCommit(null);
    setAiRemainingFiles(status.staged.length + status.unstaged.length + status.untracked.length);
    setIsAiJobRunning(true);
    setAiProgressMessage('KI startet...');
    setIsAiCommitting(true);
    try {
      const latestSettings = await window.electronAPI.getSettings();
      const latestModel = latestSettings.aiProvider === 'gemini'
        ? (latestSettings.geminiModel || '')
        : (latestSettings.ollamaModel || '');

      if (!latestSettings.aiAutoCommitEnabled) {
        setToast({ msg: 'KI Auto-Commit ist in den Einstellungen deaktiviert.', isError: true });
        return;
      }

      if (!latestModel.trim()) {
        setToast({ msg: 'Bitte in den Einstellungen zuerst ein KI-Modell auswaehlen.', isError: true });
        return;
      }

      const result = await window.electronAPI.runAiAutoCommit();
      if (!result.success) {
        setToast({ msg: result.error || 'KI Auto-Commit fehlgeschlagen.', isError: true });
        return;
      }

      const commits = result.data.commits || [];
      const warnings = result.data.warnings || [];
      const diagnostics = result.data.diagnostics || [];

      if (commits.length === 0) {
        setToast({ msg: result.data.summary || 'KI hat keine Commits erstellt.', isError: false });
      } else {
        const list = commits.map((commit: { hash: string; subject: string }) => `${commit.hash} ${commit.subject}`).join(' | ');
        const extra = warnings.length > 0 ? ` | Hinweise: ${warnings.length}` : '';
        setToast({ msg: `KI Commit(s): ${list}${extra}`, isError: false });
      }

      if (diagnostics.length > 0) {
        console.info('AI Auto-Commit diagnostics:', diagnostics);
      }
      if (onRepoChanged) onRepoChanged();
      await refresh();
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : 'KI Auto-Commit fehlgeschlagen.', isError: true });
    } finally {
      setIsAiCommitting(false);
      setIsAiJobRunning(false);
    }
  }, [status, setToast, refresh, onRepoChanged]);

  const handleCancelAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.cancelAiAutoCommit();
      if (result.success && result.canceled) {
        setAiProgressMessage('Abbruch wird ausgefuehrt...');
      } else {
        setAiProgressMessage('Kein laufender KI Auto-Commit zum Abbrechen.');
      }
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : 'KI Auto-Commit konnte nicht abgebrochen werden.', isError: true });
    }
  }, [setToast]);

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
