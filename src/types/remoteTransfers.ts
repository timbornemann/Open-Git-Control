import type { HostedRepositoryRef, RepositoryEndpoint } from './hostingDtos';

export interface GitRemoteDto {
  name: string;
  fetchUrls: string[];
  pushUrls: string[];
}
export interface GitRemoteSnapshotDto {
  repoPath: string;
  branch: string;
  upstream: { remote: string; branch: string } | null;
  defaultPushRemote: string | null;
  remotes: GitRemoteDto[];
  supportsPushUrlIsolation: boolean;
}
export interface RemoteMutation {
  action: 'add' | 'remove' | 'rename' | 'set-url';
  name: string;
  url?: string;
  newName?: string;
  pushUrls?: string[];
}
export interface GitPushProfile {
  id: string;
  name: string;
  remoteNames: string[];
  destinationBranch?: string;
  targetBranches?: Record<string, string>;
  tagNames?: string[];
}
export type RemoteTransferAction = 'fetch' | 'pull' | 'push';
export type RemoteSelectionMode = 'remember' | 'ask';
export interface RemoteSelectionSnapshot {
  remotes: Array<{ name: string; urls: string[]; bindings: RepositoryEndpoint[] }>;
}
export interface RemotePreferences {
  hostingRemote?: string;
  hostingRepository?: HostedRepositoryRef;
  bindings?: RepositoryEndpoint[];
  fetchRemote?: string;
  pullRemote?: string;
  selectionModes?: Partial<Record<RemoteTransferAction, RemoteSelectionMode>>;
  selectionSnapshots?: Partial<Record<RemoteTransferAction, RemoteSelectionSnapshot>>;
  pullBranches?: Record<string, string>;
  pushBranches?: Record<string, Record<string, string>>;
  pushRemotes?: string[];
  profiles?: GitPushProfile[];
  activeProfileId?: string;
}
export interface GitPushTargetDto {
  lfsEndpoint?: string;
  grouped?: boolean;
  id: string;
  remoteName: string;
  url: string;
  destinationRef: string;
  sourceOid: string;
  leaseOid?: string | null;
}
export interface GitPushPlanDto {
  lfsObjects?: Array<{ oid: string; size: number }>;
  id: string;
  /** Push operands without the subcommand: plan marker followed by captured OID refspecs. */
  secretScanArgs: string[];
  repoPath: string;
  sourceOid: string;
  branch: string;
  tagNames: string[];
  sourceBranch?: string;
  branchRefs?: Array<{ sourceBranch: string; destinationBranch: string; sourceOid: string }>;
  tagRefs?: Array<{ name: string; oid: string }>;
  force: boolean;
  targets: GitPushTargetDto[];
}
export type GitPushTargetStatus = 'success' | 'up-to-date' | 'rejected' | 'failed' | 'unknown' | 'skipped';
export interface GitPushTargetResultDto extends GitPushTargetDto {
  status: GitPushTargetStatus;
  message: string;
  refResults?: Array<{ destinationRef: string; sourceOid: string; status: GitPushTargetStatus; message: string }>;
}
export interface GitPushBatchDto {
  id: string;
  planId: string;
  repoPath: string;
  sourceOid: string;
  state: 'success' | 'partial' | 'failed' | 'cancelled';
  targets: GitPushTargetResultDto[];
}
export interface RemoteTransferOperations {
  getRemotes: { input: { repoPath: string }; output: GitRemoteSnapshotDto };
  editRemote: { input: { repoPath: string; mutation: RemoteMutation }; output: GitRemoteSnapshotDto };
  getPreferences: { input: { repoPath: string }; output: RemotePreferences };
  setPreferences: { input: { repoPath: string; preferences: RemotePreferences }; output: RemotePreferences };
  fetch: { input: { repoPath: string; remote: string; tagsOnly?: boolean }; output: { output: string } };
  pull: { input: { repoPath: string; remote: string; branch: string; mode: 'default' | 'rebase' | 'no-ff' | 'ff-only' }; output: { output: string } };
  setUpstream: { input: { repoPath: string; remote: string; branch: string }; output: true };
  planPush: {
    input: {
      repoPath: string;
      remoteNames: string[];
      sourceBranch?: string;
      branchTargets?: Array<{ sourceBranch: string; destinationBranch: string }>;
      destinationBranch?: string;
      targetBranches?: Record<string, string>;
      targetUrls?: Record<string, string[]>;
      tagNames?: string[];
      force?: boolean;
    };
    output: GitPushPlanDto;
  };
  executePush: { input: { repoPath: string; planId: string }; output: GitPushBatchDto };
  retryPush: { input: { repoPath: string; batchId: string; targetIds?: string[] }; output: GitPushBatchDto };
  cancel: { input: { repoPath: string }; output: true };
}
export type RemoteTransferOperation = keyof RemoteTransferOperations;
