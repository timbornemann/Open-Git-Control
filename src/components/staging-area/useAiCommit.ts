import { useCallback, useEffect, useState } from 'react';
import type { ToastMessage } from '../../types/git';
import { useI18n } from '../../i18n';
import type { GitStatusWithConflicts } from './types';

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
        setAiProgressMessage(event.message || tr('KI arbeitet...', 'AI is working...'));
        return;
      }

      if (event.status === 'done') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || tr('KI Auto-Commit abgeschlossen.', 'AI auto-commit completed.'));
        return;
      }

      if (event.status === 'failed') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.'));
        return;
      }

      if (event.status === 'cancelled') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || tr('KI Auto-Commit abgebrochen.', 'AI auto-commit cancelled.'));
      }
    });

    return unsubscribe;
  }, [tr]);

  const handleAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI || !status) return;

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
    setIsAiCommitting(true);
    try {
      const latestSettings = await window.electronAPI.getSettings();
      const latestModel = latestSettings.aiProvider === 'gemini'
        ? (latestSettings.geminiModel || '')
        : (latestSettings.ollamaModel || '');

      if (!latestSettings.aiAutoCommitEnabled) {
        setToast({ msg: tr('KI Auto-Commit ist in den Einstellungen deaktiviert.', 'AI auto-commit is disabled in settings.'), isError: true });
        return;
      }

      if (!latestModel.trim()) {
        setToast({ msg: tr('Bitte in den Einstellungen zuerst ein KI-Modell auswaehlen.', 'Please choose an AI model in settings first.'), isError: true });
        return;
      }

      const result = await window.electronAPI.runAiAutoCommit();
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
      setToast({ msg: error instanceof Error ? error.message : tr('KI Auto-Commit fehlgeschlagen.', 'AI auto-commit failed.'), isError: true });
    } finally {
      setIsAiCommitting(false);
      setIsAiJobRunning(false);
    }
  }, [status, setToast, refresh, onRepoChanged, tr]);

  const handleCancelAiAutoCommit = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.cancelAiAutoCommit();
      if (result.success && result.canceled) {
        setAiProgressMessage(tr('Abbruch wird ausgefuehrt...', 'Cancellation in progress...'));
      } else {
        setAiProgressMessage(tr('Kein laufender KI Auto-Commit zum Abbrechen.', 'No running AI auto-commit to cancel.'));
      }
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : tr('KI Auto-Commit konnte nicht abgebrochen werden.', 'Could not cancel AI auto-commit.'), isError: true });
    }
  }, [setToast, tr]);

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
