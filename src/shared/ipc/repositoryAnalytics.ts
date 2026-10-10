import type { ReadRequest } from '../cache/resource';
import type { IpcResult } from '../../types/ipc';

export type AnalyticsFilters = {
  scope: string;
  revision: string;
  since: string;
  until: string;
  author: string;
  path: string;
  aggregation: 'auto' | 'day' | 'week' | 'month';
  compareFrom: string;
  compareTo: string;
};
export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = {
  scope: 'all',
  revision: 'HEAD',
  since: '',
  until: '',
  author: '',
  path: '',
  aggregation: 'auto',
  compareFrom: '',
  compareTo: 'HEAD',
};
export type AnalyticsIdentity = { id: string; name: string; email: string };
export type AnalyticsChanges = {
  additions: number;
  deletions: number;
  changes: number;
  authors: number;
  lastChanged: number;
  path: string;
  oldPath?: string;
  hash: string;
  binary: boolean;
};
export type AnalyticsContribution = AnalyticsIdentity & { commits: number; merges: number; additions: number; deletions: number; files: number; lines: number };
export type AnalyticsPeriod = { date: string; commits: number; merges: number; additions: number; deletions: number };
export type AnalyticsCoupling = { first: string; second: string; commits: number; share: number };
export type AnalyticsCommit = {
  hash: string;
  parents: string[];
  author: AnalyticsIdentity;
  date: number;
  subject: string;
  files: number;
  additions: number;
  deletions: number;
};
export type AnalyticsTag = { name: string; oid: string; date: number; version: boolean };
export type AnalyticsProject = {
  oid: string;
  files: number;
  textFiles: number;
  binaryFiles: number;
  lfsFiles: number;
  symlinks: number;
  submodules: number;
  excludedFiles: number;
  lines: number;
  blamedLines: number;
  unblamedFiles: number;
  languages: { language: string; files: number; lines: number }[];
  ownership: (AnalyticsIdentity & { lines: number })[];
};
export type AnalyticsComparison = {
  from: string;
  to: string;
  fromOid: string;
  toOid: string;
  ancestor: boolean;
  commits: number;
  contributors: number;
  additions: number;
  deletions: number;
  files: number;
  paths: AnalyticsChanges[];
};
export type RepositoryAnalyticsSnapshot = {
  id: string;
  repoPath: string;
  savedAt: number;
  complete: boolean;
  filters: AnalyticsFilters;
  sections: ('history' | 'project' | 'blame' | 'comparison')[];
  authors: AnalyticsIdentity[];
  refs: { name: string; oid: string; remote: boolean }[];
  tags: AnalyticsTag[];
  head: string;
  totals: { commits: number; merges: number; contributors: number; firstActivity: number; lastActivity: number };
  filteredCommits: number;
  additions: number;
  deletions: number;
  excludedCouplingCommits: number;
  contributors: AnalyticsContribution[];
  periods: AnalyticsPeriod[];
  calendar: AnalyticsPeriod[];
  hotspots: AnalyticsChanges[];
  directories: AnalyticsChanges[];
  coupling: AnalyticsCoupling[];
  /** Content version of all coupling pairs, including rows outside the preview. */
  couplingVersion?: string;
  project: AnalyticsProject;
  comparison: AnalyticsComparison | null;
  warnings: string[];
};
export type AnalyticsRequest = { repoPath: string; filters: AnalyticsFilters; readRequest?: ReadRequest };
export type AnalyticsProgress = {
  repoPath: string;
  requestId: string;
  phase: 'history' | 'project' | 'blame' | 'aggregation';
  completed: number;
  total: number;
  snapshot?: RepositoryAnalyticsSnapshot;
};
export type AnalyticsDetailRequest = {
  repoPath: string;
  snapshotId: string;
  kind: 'commits' | 'hotspots' | 'directories' | 'coupling' | 'comparison';
  offset: number;
  limit: number;
  path?: string;
  author?: string;
  since?: string;
  until?: string;
};
export type AnalyticsDetails = { items: (AnalyticsCommit | AnalyticsChanges | AnalyticsCoupling)[]; total: number; offset: number };
export interface RepositoryAnalyticsApi {
  getRepositoryAnalyticsSnapshot: (request: AnalyticsRequest) => Promise<IpcResult<RepositoryAnalyticsSnapshot | null>>;
  refreshRepositoryAnalytics: (request: AnalyticsRequest) => Promise<IpcResult<RepositoryAnalyticsSnapshot>>;
  getRepositoryAnalyticsDetails: (request: AnalyticsDetailRequest) => Promise<IpcResult<AnalyticsDetails>>;
  onRepositoryAnalyticsProgress: (callback: (event: AnalyticsProgress) => void) => () => void;
}
