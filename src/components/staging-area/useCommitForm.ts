import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettingsDto } from '../../global';
import type { ToastMessage } from '../../types/git';
import { useI18n } from '../../i18n';
import type { GitStatusWithConflicts } from './types';

const LEGACY_COMMIT_ARG_LIMIT = 512;

type Params = {
  repoPath: string | null;
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
  onCommitsCreated?: () => void;
  settings: AppSettingsDto;
};

export const useCommitForm = ({ repoPath, status, setToast, refresh, onRepoChanged, onCommitsCreated, settings }: Params) => {
  const { tr } = useI18n();
  const [commitMsg, setCommitMsg] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [amendCommit, setAmendCommit] = useState(false);
  const [signoffCommit, setSignoffCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const isCommittingRef = useRef(false);

  useEffect(() => {
    setSignoffCommit(Boolean(settings.commitSignoffByDefault));
  }, [settings.commitSignoffByDefault]);

  useEffect(() => {
    if (settings.commitTemplate) {
      setCommitMsg((current) => (current.trim() ? current : settings.commitTemplate));
    }
  }, [settings.commitTemplate]);

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
    if (isCommittingRef.current || !commitMsg.trim() || !window.electronAPI || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: tr('Bitte zuerst alle Konflikte aufloesen.', 'Please resolve all conflicts first.'), isError: true });
      return;
    }

    if (status.staged.length === 0 && !amendCommit) {
      setToast({ msg: tr('Bitte zuerst Dateien stagen.', 'Please stage files first.'), isError: true });
      return;
    }

    isCommittingRef.current = true;
    setIsCommitting(true);
    try {
      const title = commitMsg.trim();
      const description = commitDescription.trim();
      const r = typeof window.electronAPI.createCommit === 'function'
        ? await window.electronAPI.createCommit({
          title,
          description,
          amend: amendCommit,
          signoff: signoffCommit,
        })
        : await (async () => {
          if (title.length > LEGACY_COMMIT_ARG_LIMIT || description.length > LEGACY_COMMIT_ARG_LIMIT) {
            return {
              success: false,
              error: tr(
                'Commit-Nachricht ist fuer die aktuell geladene App-Version zu lang. Bitte App neu laden oder neu starten.',
                'Commit message is too long for the currently loaded app version. Please reload or restart the app.',
              ),
            };
          }

          const commitArgs: string[] = ['commit'];
          if (amendCommit) commitArgs.push('--amend');
          if (signoffCommit) commitArgs.push('--signoff');
          commitArgs.push('-m', title);
          if (description) commitArgs.push('-m', description);
          return window.electronAPI.runGitCommand(commitArgs[0], ...commitArgs.slice(1));
        })();
      if (r.success) {
        setCommitMsg(settings.commitTemplate || '');
        setCommitDescription('');
        setToast({ msg: tr('Commit erfolgreich!', 'Commit successful!'), isError: false });
        if (onCommitsCreated) onCommitsCreated();
        else if (onRepoChanged) onRepoChanged();
        await refresh();
      } else {
        setToast({ msg: r.error || tr('Commit fehlgeschlagen', 'Commit failed'), isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    } finally {
      isCommittingRef.current = false;
      setIsCommitting(false);
    }
  }, [commitMsg, commitDescription, amendCommit, signoffCommit, status, settings.commitTemplate, setToast, refresh, onRepoChanged, onCommitsCreated, tr]);

  return {
    commitMsg, setCommitMsg,
    commitDescription, setCommitDescription,
    amendCommit, setAmendCommit,
    signoffCommit, setSignoffCommit,
    isCommitting,
    handleCommit,
  };
};
