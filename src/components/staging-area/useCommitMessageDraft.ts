import { useCallback, useLayoutEffect, useState } from 'react';
import { getCommitFormDraft, resetCommitFormDraft, updateCommitFormDraft, type CommitFormDraft } from './commitFormDraft';
import type { CommitSubject } from './commitSubject';

export const useCommitMessageDraft = (repoPath: string | null, commitTemplate: string) => {
  const [draft, setDraft] = useState(() => getCommitFormDraft(repoPath, commitTemplate));

  useLayoutEffect(() => {
    setDraft(getCommitFormDraft(repoPath, commitTemplate));
  }, [repoPath, commitTemplate]);

  const updateDraft = useCallback(
    (patch: Partial<CommitFormDraft>) => setDraft(updateCommitFormDraft(repoPath, patch, commitTemplate)),
    [repoPath, commitTemplate],
  );
  const setCommitMsg = useCallback((value: string) => updateDraft({ commitMsg: value }), [updateDraft]);
  const setCommitDescription = useCallback((value: string) => updateDraft({ commitDescription: value }), [updateDraft]);
  const setCommitSubject = useCallback(
    (patch: Partial<CommitSubject>) => {
      const current = getCommitFormDraft(repoPath, commitTemplate);
      updateDraft({ subject: { ...current.subject, ...patch } });
    },
    [repoPath, commitTemplate, updateDraft],
  );
  const clearCommittedDraft = useCallback((committedRepo: string, applyToForm: boolean) => {
    const next = resetCommitFormDraft(committedRepo);
    if (applyToForm) setDraft(next);
  }, []);

  return {
    commitMsg: draft.commitMsg,
    commitDescription: draft.commitDescription,
    commitSubject: draft.subject,
    setCommitMsg,
    setCommitDescription,
    setCommitSubject,
    clearCommittedDraft,
  };
};
