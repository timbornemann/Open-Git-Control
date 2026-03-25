import { useCallback, useEffect, useState } from 'react';
import type { AppSettingsDto } from '../../global';
import type { ToastMessage } from '../../types/git';
import type { GitStatusWithConflicts } from './types';

type Params = {
  repoPath: string | null;
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
  settings: AppSettingsDto;
};

export const useCommitForm = ({ repoPath, status, setToast, refresh, onRepoChanged, settings }: Params) => {
  const [commitMsg, setCommitMsg] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [amendCommit, setAmendCommit] = useState(false);
  const [signoffCommit, setSignoffCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  useEffect(() => {
    setSignoffCommit(Boolean(settings.commitSignoffByDefault));
  }, [settings.commitSignoffByDefault]);

  useEffect(() => {
    if (settings.commitTemplate && !commitMsg.trim()) {
      setCommitMsg(settings.commitTemplate);
    }
  }, [settings.commitTemplate, commitMsg]);

  useEffect(() => {
    if (!amendCommit || !repoPath || !window.electronAPI) return;
    void window.electronAPI.runGitCommand('show', '--format=%B', '-s', 'HEAD').then((r) => {
      if (r.success && typeof r.data === 'string') {
        const lines = r.data.trimEnd().split('\n');
        setCommitMsg(lines[0] || '');
        setCommitDescription(lines.slice(2).join('\n'));
      }
    });
  }, [amendCommit, repoPath]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || !window.electronAPI || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: 'Bitte zuerst alle Konflikte aufloesen.', isError: true });
      return;
    }

    if (status.staged.length === 0 && !amendCommit) {
      setToast({ msg: 'Bitte zuerst Dateien stagen.', isError: true });
      return;
    }

    setIsCommitting(true);
    try {
      const commitArgs: string[] = ['commit'];
      if (amendCommit) commitArgs.push('--amend');
      if (signoffCommit) commitArgs.push('--signoff');
      commitArgs.push('-m', commitMsg.trim());
      if (commitDescription.trim()) {
        commitArgs.push('-m', commitDescription.trim());
      }
      const r = await window.electronAPI.runGitCommand(commitArgs[0], ...commitArgs.slice(1));
      if (r.success) {
        setCommitMsg('');
        setCommitDescription('');
        setToast({ msg: 'Commit erfolgreich!', isError: false });
        if (onRepoChanged) onRepoChanged();
        await refresh();
      } else {
        setToast({ msg: r.error || 'Commit fehlgeschlagen', isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    } finally {
      setIsCommitting(false);
    }
  }, [commitMsg, commitDescription, amendCommit, signoffCommit, status, setToast, refresh, onRepoChanged]);

  return {
    commitMsg, setCommitMsg,
    commitDescription, setCommitDescription,
    amendCommit, setAmendCommit,
    signoffCommit, setSignoffCommit,
    isCommitting,
    handleCommit,
  };
};
