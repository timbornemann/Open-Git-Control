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
