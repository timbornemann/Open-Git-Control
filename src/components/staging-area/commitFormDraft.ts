import { normalizeRepoPathKey } from '../../utils/repoPath';

export type CommitFormDraft = {
  commitMsg: string;
  commitDescription: string;
};

const commitFormDraftsByRepo = new Map<string, CommitFormDraft>();

const getRepoDraftKey = (repoPath: string | null): string => (
  repoPath ? normalizeRepoPathKey(repoPath) : ''
);

const createDefaultDraft = (commitTemplate: string): CommitFormDraft => ({
  commitMsg: commitTemplate || '',
  commitDescription: '',
});

export const getCommitFormDraft = (
  repoPath: string | null,
  commitTemplate: string,
): CommitFormDraft => {
  const key = getRepoDraftKey(repoPath);
  if (!key) return createDefaultDraft(commitTemplate);

  const existing = commitFormDraftsByRepo.get(key);
  if (existing) return existing;

  const draft = createDefaultDraft(commitTemplate);
  commitFormDraftsByRepo.set(key, draft);
  return draft;
};

export const updateCommitFormDraft = (
  repoPath: string | null,
  patch: Partial<CommitFormDraft>,
  commitTemplate = '',
): CommitFormDraft => {
  const key = getRepoDraftKey(repoPath);
  const current = key
    ? commitFormDraftsByRepo.get(key) || createDefaultDraft(commitTemplate)
    : createDefaultDraft(commitTemplate);
  const next = { ...current, ...patch };
  if (key) commitFormDraftsByRepo.set(key, next);
  return next;
};

export const resetCommitFormDraft = (
  repoPath: string | null,
  commitTemplate: string,
): CommitFormDraft => (
  updateCommitFormDraft(repoPath, createDefaultDraft(commitTemplate), commitTemplate)
);

export const clearCommitFormDraftsForTests = () => {
  commitFormDraftsByRepo.clear();
};
