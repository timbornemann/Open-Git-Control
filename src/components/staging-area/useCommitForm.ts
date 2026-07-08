import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettingsDto } from '../../global';
import type { ToastMessage } from '../../types/git';
import { useI18n } from '../../i18n';
import { gitClient } from '../../services/gitClient';
import type { GitStatusWithConflicts } from './types';
import {
  getCommitFormDraft,
  resetCommitFormDraft,
  updateCommitFormDraft,
} from './commitFormDraft';

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
  const [commitMsg, setCommitMsgState] = useState(() => (
    getCommitFormDraft(repoPath, settings.commitTemplate).commitMsg
  ));
  const [commitDescription, setCommitDescriptionState] = useState(() => (
    getCommitFormDraft(repoPath, settings.commitTemplate).commitDescription
  ));
  const [amendCommit, setAmendCommit] = useState(false);
  const [signoffCommit, setSignoffCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const isCommittingRef = useRef(false);

  const setCommitMsg = useCallback((value: string) => {
    setCommitMsgState(value);
    updateCommitFormDraft(repoPath, { commitMsg: value }, settings.commitTemplate);
  }, [repoPath, settings.commitTemplate]);

  const setCommitDescription = useCallback((value: string) => {
    setCommitDescriptionState(value);
    updateCommitFormDraft(repoPath, { commitDescription: value }, settings.commitTemplate);
  }, [repoPath, settings.commitTemplate]);

  useEffect(() => {
    const draft = getCommitFormDraft(repoPath, settings.commitTemplate);
    setCommitMsgState(draft.commitMsg);
    setCommitDescriptionState(draft.commitDescription);
  }, [repoPath, settings.commitTemplate]);

  useEffect(() => {
    setSignoffCommit(Boolean(settings.commitSignoffByDefault));
  }, [settings.commitSignoffByDefault]);

  useEffect(() => {
    if (settings.commitTemplate) {
      setCommitMsgState((current) => {
        if (current.trim()) return current;
        updateCommitFormDraft(repoPath, { commitMsg: settings.commitTemplate }, settings.commitTemplate);
        return settings.commitTemplate;
      });
    }
  }, [repoPath, settings.commitTemplate]);

  useEffect(() => {
    if (!amendCommit || !repoPath || !gitClient.isAvailable()) return;
    void gitClient.runGitCommand('show', '--format=%B', '-s', 'HEAD').then((r) => {
      if (r.success && typeof r.data === 'string') {
        const lines = r.data.trimEnd().split('\n');
        setCommitMsg(lines[0] || '');
        setCommitDescription(lines.slice(2).join('\n'));
      }
    });
  }, [amendCommit, repoPath, setCommitDescription, setCommitMsg]);

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
          return gitClient.runGitCommand('commit', ...commitArgs.slice(1));
        })();
      if (r.success) {
        const nextDraft = resetCommitFormDraft(repoPath, settings.commitTemplate || '');
        setCommitMsgState(nextDraft.commitMsg);
        setCommitDescriptionState(nextDraft.commitDescription);
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
  }, [repoPath, commitMsg, commitDescription, amendCommit, signoffCommit, status, settings.commitTemplate, setToast, refresh, onRepoChanged, onCommitsCreated, tr]);

  return {
    commitMsg, setCommitMsg,
    commitDescription, setCommitDescription,
    amendCommit, setAmendCommit,
    signoffCommit, setSignoffCommit,
    isCommitting,
    handleCommit,
  };
};
