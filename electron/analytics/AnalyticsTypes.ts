import type { AnalyticsIdentity, AnalyticsFilters, RepositoryAnalyticsSnapshot } from '../../src/shared/ipc/repositoryAnalytics';

export type FileChange = {
  path: string;
  oldPath?: string;
  before: string;
  after: string;
  mode: string;
  additions: number;
  deletions: number;
  binary: boolean;
  status: string;
};
export type CommitRecord = { hash: string; parents: string[]; author: AnalyticsIdentity; date: number; subject: string; changes: FileChange[] };
export type BlobRecord = { oid: string; kind: 'text' | 'binary' | 'lfs'; lines: number };
export type BlameRecord = { revision: string; path: string; oid: string; authors: (AnalyticsIdentity & { lines: number })[] };
export type TreeEntry = { path: string; oid: string; mode: string; size: number };
export type AnalyticsCacheData = {
  commits: Map<string, CommitRecord>;
  blobs: Map<string, BlobRecord>;
  blame: Map<string, BlameRecord>;
  classified: Set<string>;
  snapshot: RepositoryAnalyticsSnapshot | null;
  filters?: AnalyticsFilters;
};
