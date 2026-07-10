import type { GitCommandName } from '../shared/ipc/gitCommands';
import type { IpcResult } from './ipc';
import type { SecretScanSourceDto, SecretScanStrictnessDto } from './appDtos';

export type GitCommandNameDto = GitCommandName;
export type GitCommandResultDto = IpcResult<string>;

export interface GitStashEntryDto {
  index: number;
  name: string;
  hash: string;
  branch: string;
  subject: string;
}

export interface SecretScanFindingDto {
  id: string;
  ruleId: string;
  severity: 'medium' | 'high' | 'critical';
  source: SecretScanSourceDto;
  filePath: string;
  lineNumber: number;
  contextLine: string;
}

export interface SecretScanResultDto {
  scanned: boolean;
  strictness: SecretScanStrictnessDto;
  findings: SecretScanFindingDto[];
  notes: string[];
  stats: {
    checkedLines: number;
    stagedLines: number;
    toPushLines: number;
    tagLines: number;
  };
}

export type CommitStatsStateDto = 'missing' | 'queued' | 'loading' | 'ready' | 'error';

export interface CommitStatsDto {
  files: number;
  additions: number;
  deletions: number;
}

export interface CommitLogPageDto {
  raw: string;
  hasMore: boolean;
  stats: Record<string, CommitStatsDto>;
  repoPath: string;
}

export interface CommitStatsUpdateDto {
  repoPath: string;
  hash: string;
  stats: CommitStatsDto | null;
  state: 'loading' | 'ready' | 'error';
}

export interface WorkingTreeSnapshotDto {
  snapshotId: string;
  repoPath: string;
  statusRaw: string;
  changeCount: number;
  durationMs: number;
  largeMode: boolean;
  isBare: boolean;
}

export interface WorkingTreeStatsDto {
  snapshotId: string;
  staged: CommitStatsDto;
  unstaged: CommitStatsDto;
}

export interface DiffPreviewDto {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
}

export type RepositoryFileSourceDto = 'unstaged' | 'staged' | 'commit';

export interface MarkdownPreviewFileDto {
  text: string;
}

export interface RepoFileDataUrlDto {
  dataUrl: string;
  mimeType: string;
  bytes: number;
}

export type FileTimelineChangeDto = {
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
};

export type FileTimelineCommitDto = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: FileTimelineChangeDto[];
};
