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
  const { t, tr } = useI18n();
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
    if (isCommittingRef.current || !commitMsg.trim() || !gitClient.isAvailable() || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: t('generated.components.staging_area.useaicommit.please_resolve_all_conflicts_first_9e29c688'), isError: true });
      return;
    }

    if (status.staged.length === 0 && !amendCommit) {
      setToast({ msg: t('generated.components.staging_area.usecommitform.please_stage_files_first_51f233fa'), isError: true });
      return;
    }

    isCommittingRef.current = true;
    setIsCommitting(true);
    try {
      const title = commitMsg.trim();
      const description = commitDescription.trim();
      const r = await gitClient.createCommit({
        title,
        description,
        amend: amendCommit,
        signoff: signoffCommit,
      });
      if (r.success) {
        const nextDraft = resetCommitFormDraft(repoPath, settings.commitTemplate || '');
        setCommitMsgState(nextDraft.commitMsg);
        setCommitDescriptionState(nextDraft.commitDescription);
        setToast({ msg: t('generated.components.staging_area.usecommitform.commit_successful_155eebd2'), isError: false });
        if (onCommitsCreated) onCommitsCreated();
        else if (onRepoChanged) onRepoChanged();
        await refresh();
      } else {
        setToast({ msg: r.error || t('generated.components.staging_area.usecommitform.commit_failed_5c16676c'), isError: true });
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
