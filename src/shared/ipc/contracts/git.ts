import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '../../../types/git';
import type {
  CommitLogPageDto,
  CommitStatsDto,
  CommitStatsUpdateDto,
  DiffPreviewDto,
  FileTimelineCommitDto,
  GitCommandResultDto,
  GitStashEntryDto,
  MarkdownPreviewFileDto,
  RepoFileDataUrlDto,
  RepositoryFileSourceDto,
  SecretScanResultDto,
  WorkingTreeSnapshotDto,
  WorkingTreeStatsDto,
} from '../../../types/gitDtos';
import type { GitCommandName } from '../gitCommands';
import type { GitJobEventDto } from '../../../types/aiDtos';
import type { IpcResult } from '../../../types/ipc';

export type RepoUnavailablePayloadDto = {
  command: string;
  error: string;
};

export type CreateCommitParamsDto = {
  title: string;
  description?: string;
  amend?: boolean;
  signoff?: boolean;
  allowEmpty?: boolean;
};

export type CommitLogPageRequestDto = {
  limit: number;
  offset: number;
  scope: 'all' | 'head';
};

export type CommitStatsPriorityDto = 'selected' | 'visible' | 'background';

export type CommitStatsRequestResultDto = Record<
  string,
  {
    state: 'ready' | 'queued';
    stats: CommitStatsDto | null;
  }
>;

export type DiffPreviewLimitsDto = {
  maxBytes?: number;
  maxLines?: number;
};

export type PatchApplyOptionsDto = {
  cached?: boolean;
  reverse?: boolean;
};

export type RepositoryFileRequestDto = {
  source: RepositoryFileSourceDto;
  path: string;
  commitHash?: string;
};

export type AddIgnoreRuleResultDto = {
  success: boolean;
  added?: boolean;
  pattern?: string;
  error?: string;
};

export type GitCloneResultDto = {
  success: boolean;
  repoPath: string;
  error?: string;
};

export type GitInitResultDto = {
  success: boolean;
  data?: string;
  error?: string;
};

export type RepoFileReadResultDto = {
  success: boolean;
  data?: string;
  error?: string;
};

export type RepoFileWriteResultDto = {
  success: boolean;
  error?: string;
};

export type OpenSubmoduleResultDto = {
  success: boolean;
  error?: string;
};

export interface ElectronGitAPI {
  setRepoPath: (repoPath: string) => Promise<boolean>;
  clearRepoPath: () => Promise<boolean>;
  runGitCommand: (command: GitCommandName, ...args: string[]) => Promise<GitCommandResultDto>;
  runGitCommandForRepo: (repoPath: string, command: GitCommandName, ...args: string[]) => Promise<GitCommandResultDto>;
  createCommit: (params: CreateCommitParamsDto) => Promise<IpcResult<string>>;
  getCommitLogPage: (params: CommitLogPageRequestDto) => Promise<IpcResult<CommitLogPageDto>>;
  requestCommitStats: (hashes: string[], priority?: CommitStatsPriorityDto) => Promise<IpcResult<CommitStatsRequestResultDto>>;
  onCommitStats: (callback: (update: CommitStatsUpdateDto) => void) => () => void;
  getWorkingTreeSnapshot: () => Promise<IpcResult<WorkingTreeSnapshotDto>>;
  getWorkingTreeStats: (snapshotId: string) => Promise<IpcResult<WorkingTreeStatsDto>>;
  stagePaths: (paths: string[], repoPath?: string) => Promise<IpcResult<string>>;
  getDiffPreview: (args: string[], limits?: DiffPreviewLimitsDto) => Promise<IpcResult<DiffPreviewDto>>;
  getFileBlameRange: (filePath: string, commitHash: string | undefined, startLine: number, lineCount: number) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  onRepoUnavailable: (callback: (payload: RepoUnavailablePayloadDto) => void) => () => void;
  startInteractiveRebase: (baseHash: string, todoLines: string[]) => Promise<IpcResult<string>>;
  applyPatch: (patch: string, options?: PatchApplyOptionsDto) => Promise<IpcResult<string>>;
  getStashes: () => Promise<IpcResult<GitStashEntryDto[]>>;
  gitStashBranch: (stashName: string, branchName: string) => Promise<IpcResult<string>>;
  getRepoOriginUrl: (repoPath: string) => Promise<IpcResult<string | null>>;
  addIgnoreRule: (pattern: string, repoPath?: string) => Promise<AddIgnoreRuleResultDto>;
  gitFetch: () => Promise<GitCommandResultDto>;
  gitPull: () => Promise<GitCommandResultDto>;
  gitPush: () => Promise<GitCommandResultDto>;
  scanPushSecrets: (params?: { includeTags?: boolean; repoPath?: string }) => Promise<IpcResult<SecretScanResultDto>>;
  approveSecretScanPush: (pushArgs?: string[]) => Promise<{ success: boolean }>;
  cancelSecretScan: () => Promise<{ success: boolean; cancelled: boolean }>;
  gitClone: (cloneUrl: string, targetDir: string, targetName?: string) => Promise<GitCloneResultDto>;
  gitInit: (repoPath: string) => Promise<GitInitResultDto>;
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) => Promise<IpcResult<GitFileHistoryEntryDto[]>>;
  getFileBlame: (filePath: string, commitHash?: string) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  getFileTimelineData: (limit?: number) => Promise<IpcResult<FileTimelineCommitDto[]>>;
  readRepoFile: (filePath: string) => Promise<RepoFileReadResultDto>;
  getMarkdownPreviewFile: (params: RepositoryFileRequestDto) => Promise<IpcResult<MarkdownPreviewFileDto>>;
  getRepoFileDataUrl: (params: RepositoryFileRequestDto) => Promise<IpcResult<RepoFileDataUrlDto>>;
  writeRepoFile: (filePath: string, content: string) => Promise<RepoFileWriteResultDto>;
  openSubmodule: (submodulePath: string) => Promise<OpenSubmoduleResultDto>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  onJobEvent: (callback: (event: GitJobEventDto) => void) => () => void;
}
