export type BranchInfo = {
  name: string;
  isHead: boolean;
  scope: 'local' | 'remote';
};

export type RemoteSyncState = {
  isFetching: boolean;
  lastFetchedAt: number | null;
  lastFetchError: string | null;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
};

export type RemoteInfo = {
  name: string;
  url: string;
};

export type RepoOwnerRef = {
  owner: string;
  repo: string;
};

export type ToastMessage = {
  msg: string;
  isError: boolean;
};

export type GitFileHistoryEntryDto = {
  hash: string;
  abbrevHash: string;
  author: string;
  date: string;
  subject: string;
};

export type GitFileBlameLineDto = {
  lineNumber: number;
  commitHash: string;
  abbrevHash: string;
  author: string;
  authorTime: string;
  summary: string;
  content: string;
};
