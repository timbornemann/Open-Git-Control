import { create } from 'zustand';

type CommitShortcutRequest = { repoPath: string };
export const useCommitShortcutRequest = create<{ request: CommitShortcutRequest | null }>(() => ({ request: null }));
export const requestCommitShortcut = (repoPath: string) => useCommitShortcutRequest.setState({ request: { repoPath } });
export const clearCommitShortcutRequest = () => useCommitShortcutRequest.setState({ request: null });
export const consumeCommitShortcutRequest = (request: CommitShortcutRequest): boolean => {
  if (useCommitShortcutRequest.getState().request !== request) return false;
  clearCommitShortcutRequest();
  return true;
};
