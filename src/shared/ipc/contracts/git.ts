import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '../../../types/git';
import type {
  CommitLogPageDto,
  CommitStatsDto,
  CommitStatsUpdateDto,
  DiffPreviewDto,
  FileTimelineCommitDto,
  GitCommandResultDto,
  GitSequencerStateDto,
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
import type { LicenseTemplateId } from '../../licenseTemplates';

export type RepoUnavailablePayloadDto = {
  repoPath: string;
  command: string;
  error: string;
};

export type CreateCommitParamsDto = {
  repoPath?: string;
  title: string;
  description?: string;
  amend?: boolean;
  signoff?: boolean;
  allowEmpty?: boolean;
};

export type CommitLogPageRequestDto = {
  repoPath?: string;
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

export type FileBlameSourceDto = 'staged' | 'unstaged';

export type RepositoryFileRequestDto = {
  source: RepositoryFileSourceDto;
  path: string;
  commitHash?: string;
  repoPath?: string;
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
  createdFiles?: string[];
  error?: string;
};

export type RepositoryInitializationOptionsDto = {
  createReadme?: boolean;
  license?: LicenseTemplateId;
  copyrightHolder?: string;
  programName?: string;
  programDescription?: string;
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

export type RepoFileDeleteResultDto = {
  success: boolean;
  error?: string;
};

export type TextFileEncodingDto = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be' | 'latin1';

export type WorkingDirectoryEntryDto = { path: string; name: string; kind: 'file' | 'directory'; bytes?: number };
export type WorkingDirectoryFileInfoDto = {
  path: string;
  name: string;
  extension: string | null;
  bytes: number;
  createdAt: string;
  modifiedAt: string;
  accessedAt: string;
  readOnly: boolean;
  hashes: { sha256: string; sha1: string; md5: string } | null;
  hashError?: string;
  git: {
    tracked: boolean;
    ignored: boolean;
    staged: boolean;
    modified: boolean;
    conflicted: boolean;
    historyCount: number;
    firstCommit: GitFileHistoryEntryDto | null;
    latestCommit: GitFileHistoryEntryDto | null;
    error?: string;
  };
};
export type WorkingDirectoryPreviewDto =
  | { kind: 'text'; text: string; bytes: number; isMarkdown: boolean; encoding: TextFileEncodingDto; modifiedAt: string }
  | { kind: 'image'; dataUrl: string; mimeType: string; bytes: number; modifiedAt: string }
  | { kind: 'binary'; bytes: number; mimeType: string | null; reason: 'binary' | 'tooLarge'; canLoadImage?: boolean; modifiedAt: string };
export type WorkingDirectoryMutationResultDto = { success: boolean; error?: string; targetPath?: string };
export type WorkingDirectoryMoveDto = { sourcePath: string; targetPath: string };
export type WorkingDirectoryEmptyFoldersResultDto = { success: boolean; data?: string[]; error?: string };
export type WorkingDirectorySearchModeDto = 'filename' | 'content';
export type WorkingDirectorySearchMatchDto = {
  line: number;
  column: number;
  preview: string;
  previewMatchStart: number;
  matchLength: number;
};
export type WorkingDirectorySearchFileDto = {
  path: string;
  name: string;
  matches: WorkingDirectorySearchMatchDto[];
};
export type WorkingDirectorySearchResultDto = {
  files: WorkingDirectorySearchFileDto[];
  totalMatches: number;
  scannedFiles: number;
  truncated: boolean;
};
export type WorkingDirectorySearchRequestDto = {
  query: string;
  mode: WorkingDirectorySearchModeDto;
  caseSensitive?: boolean;
};
export type WorkingDirectoryReplaceTargetDto = {
  path: string;
  line: number;
  column: number;
};
export type WorkingDirectoryReplaceRequestDto = {
  query: string;
  replacement: string;
  caseSensitive?: boolean;
  target?: WorkingDirectoryReplaceTargetDto;
  all?: boolean;
  paths?: string[];
};
export type WorkingDirectoryReplaceResultDto = {
  replacements: number;
  paths: string[];
};

export type OpenSubmoduleResultDto = {
  success: boolean;
  error?: string;
};

export type RepositoryPathOpenActionDto = 'reveal' | 'open' | 'openWith';

export type OpenRepositoryPathParamsDto = {
  path?: string;
  action: RepositoryPathOpenActionDto;
  repoPath?: string;
};

export type OpenRepositoryPathResultDto = {
  success: boolean;
  error?: string;
};

export interface ElectronGitAPI {
  setRepoPath: (repoPath: string) => Promise<string>;
  clearRepoPath: () => Promise<boolean>;
  runGitCommand: (command: GitCommandName, ...args: string[]) => Promise<GitCommandResultDto>;
  runGitCommandForRepo: (repoPath: string, command: GitCommandName, ...args: string[]) => Promise<GitCommandResultDto>;
  createCommit: (params: CreateCommitParamsDto) => Promise<IpcResult<string>>;
  getCommitLogPage: (params: CommitLogPageRequestDto) => Promise<IpcResult<CommitLogPageDto>>;
  requestCommitStats: (hashes: string[], priority?: CommitStatsPriorityDto, repoPath?: string) => Promise<IpcResult<CommitStatsRequestResultDto>>;
  onCommitStats: (callback: (update: CommitStatsUpdateDto) => void) => () => void;
  getWorkingTreeSnapshot: (repoPath?: string) => Promise<IpcResult<WorkingTreeSnapshotDto>>;
  getWorkingTreeStats: (snapshotId: string, repoPath?: string) => Promise<IpcResult<WorkingTreeStatsDto>>;
  getSequencerState: (repoPath?: string) => Promise<IpcResult<GitSequencerStateDto>>;
  stagePaths: (paths: string[], repoPath?: string) => Promise<IpcResult<string>>;
  getDiffPreview: (args: string[], limits?: DiffPreviewLimitsDto, repoPath?: string) => Promise<IpcResult<DiffPreviewDto>>;
  getFileBlameRange: (
    filePath: string,
    commitHash: string | undefined,
    startLine: number,
    lineCount: number,
    repoPath?: string,
    source?: FileBlameSourceDto,
  ) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  onRepoUnavailable: (callback: (payload: RepoUnavailablePayloadDto) => void) => () => void;
  startInteractiveRebase: (baseHash: string, todoLines: string[], repoPath?: string) => Promise<IpcResult<string>>;
  applyPatch: (patch: string, options?: PatchApplyOptionsDto, repoPath?: string) => Promise<IpcResult<string>>;
  getStashes: (repoPath?: string) => Promise<IpcResult<GitStashEntryDto[]>>;
  gitStashBranch: (stashName: string, branchName: string, repoPath?: string) => Promise<IpcResult<string>>;
  getRepoOriginUrl: (repoPath: string) => Promise<IpcResult<string | null>>;
  addIgnoreRule: (pattern: string, repoPath?: string) => Promise<AddIgnoreRuleResultDto>;
  gitFetch: () => Promise<GitCommandResultDto>;
  gitPull: () => Promise<GitCommandResultDto>;
  gitPush: () => Promise<GitCommandResultDto>;
  scanCommitSecrets: (params: { repoPath: string }) => Promise<IpcResult<SecretScanResultDto>>;
  approveSecretScanCommit: (repoPath: string) => Promise<{ success: boolean }>;
  scanPushSecrets: (params: { repoPath: string; includeTags?: boolean; pushArgs?: string[] }) => Promise<IpcResult<SecretScanResultDto>>;
  approveSecretScanPush: (pushArgs: string[] | undefined, repoPath: string) => Promise<{ success: boolean }>;
  cancelSecretScan: (repoPath: string) => Promise<{ success: boolean; cancelled: boolean; error?: string }>;
  gitClone: (cloneUrl: string, targetDir: string, targetName?: string) => Promise<GitCloneResultDto>;
  gitInit: (repoPath: string, options?: RepositoryInitializationOptionsDto) => Promise<GitInitResultDto>;
  getFileHistory: (filePath: string, commitHash?: string, limit?: number, repoPath?: string) => Promise<IpcResult<GitFileHistoryEntryDto[]>>;
  getFileBlame: (filePath: string, commitHash?: string, repoPath?: string, source?: FileBlameSourceDto) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  getFileTimelineData: (limit?: number, repoPath?: string) => Promise<IpcResult<FileTimelineCommitDto[]>>;
  readRepoFile: (filePath: string, repoPath?: string) => Promise<RepoFileReadResultDto>;
  getMarkdownPreviewFile: (params: RepositoryFileRequestDto) => Promise<IpcResult<MarkdownPreviewFileDto>>;
  getRepoFileDataUrl: (params: RepositoryFileRequestDto) => Promise<IpcResult<RepoFileDataUrlDto>>;
  writeRepoFile: (filePath: string, content: string, repoPath?: string, encoding?: TextFileEncodingDto) => Promise<RepoFileWriteResultDto>;
  deleteRepoFile: (filePath: string, repoPath?: string) => Promise<RepoFileDeleteResultDto>;
  listWorkingDirectory: (repoPath: string, parentPath?: string) => Promise<IpcResult<WorkingDirectoryEntryDto[]>>;
  createWorkingDirectoryFile: (filePath: string, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  createWorkingDirectoryFolder: (folderPath: string, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  getWorkingDirectoryFileInfo: (filePath: string, repoPath: string) => Promise<IpcResult<WorkingDirectoryFileInfoDto>>;
  getWorkingDirectoryPreview: (filePath: string, repoPath: string, allowLargeImage?: boolean) => Promise<IpcResult<WorkingDirectoryPreviewDto>>;
  searchWorkingDirectory: (request: WorkingDirectorySearchRequestDto, repoPath: string) => Promise<IpcResult<WorkingDirectorySearchResultDto>>;
  replaceWorkingDirectory: (request: WorkingDirectoryReplaceRequestDto, repoPath: string) => Promise<IpcResult<WorkingDirectoryReplaceResultDto>>;
  applyWorkingDirectoryMoves: (moves: WorkingDirectoryMoveDto[], createParentFolders: boolean, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  listWorkingDirectoryFolders: (repoPath: string, parentPath?: string) => Promise<IpcResult<string[]>>;
  findEmptyWorkingDirectoryFolders: (folderPaths: string[], repoPath: string) => Promise<WorkingDirectoryEmptyFoldersResultDto>;
  deleteEmptyWorkingDirectoryFolders: (folderPaths: string[], repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  createWorkingDirectoryArchive: (sourcePaths: string[], targetPath: string, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  moveWorkingDirectoryEntry: (sourcePath: string, targetPath: string, overwrite: boolean, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  copyWorkingDirectoryEntry: (sourcePath: string, targetPath: string, overwrite: boolean, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  deleteWorkingDirectoryEntry: (filePath: string, repoPath: string) => Promise<WorkingDirectoryMutationResultDto>;
  openRepositoryPath: (params: OpenRepositoryPathParamsDto) => Promise<OpenRepositoryPathResultDto>;
  openSubmodule: (submodulePath: string, repoPath?: string) => Promise<OpenSubmoduleResultDto>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  onJobEvent: (callback: (event: GitJobEventDto) => void) => () => void;
}
