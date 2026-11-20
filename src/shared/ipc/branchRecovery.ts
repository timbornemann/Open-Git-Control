import type { IpcResult } from '../../types/ipc';

export type RepositoryHead = { kind: 'ready'; oid: string; ref?: string } | { kind: 'unborn'; ref: string };

export interface BranchHeadProblem {
  repoPath: string;
  ref: string | null;
  reason: 'broken-ref' | 'missing-ref' | 'missing-commit' | 'unverifiable';
  targetOid?: string;
  detail?: string;
  repairable: boolean;
}

export type BranchRecoverySource = 'branch-reflog' | 'head-reflog' | 'last-seen' | 'bundle';

export interface BranchRecoveryCandidate {
  oid: string;
  subject: string;
  committedAt: string;
  sources: BranchRecoverySource[];
  indexMatch: { matches: boolean; entries: number } | null;
}

export interface BranchRecoveryInspection {
  problem: BranchHeadProblem;
  candidates: BranchRecoveryCandidate[];
  confirmationId: string | null;
}

export interface RepairBranchRequest {
  repoPath: string;
  confirmationId: string;
  oid: string;
}

export interface BranchBackupStatus {
  repoPath: string | null;
  repositoryKey: string | null;
  registered: boolean;
  automatic: boolean;
  busy: boolean;
  checkedAt: number | null;
  verifiedAt: number | null;
  lastError: string | null;
  versions: BranchBackupVersion[];
}

export interface BranchBackupVersion {
  id: string;
  verifiedAt: number;
  bytes: number;
}

export interface BranchBackupOverview {
  enabled: boolean;
  directory: string;
  defaultDirectory: string;
  directoryError: string | null;
  versionCount: number;
  totalBytes: number;
  repositories: BranchBackupStatus[];
}

export type BranchBackupSelection = { automatic: boolean; repoPath?: string };
export type BranchBackupRemoval = { repositoryKey: string; versionId?: string };
export type BranchBackupOutcome = 'created' | 'up-to-date' | 'empty';

export interface ElectronBranchRecoveryAPI {
  getRepositoryHead: (repoPath: string) => Promise<IpcResult<RepositoryHead>>;
  inspectBranchRecovery: (repoPath: string) => Promise<IpcResult<BranchRecoveryInspection | null>>;
  repairBranch: (request: RepairBranchRequest) => Promise<IpcResult<{ oid: string } | null>>;
}

export interface ElectronBranchBackupAPI {
  getBranchBackupOverview: () => Promise<IpcResult<BranchBackupOverview>>;
  chooseBranchBackupDirectory: () => Promise<IpcResult<BranchBackupOverview>>;
  resetBranchBackupDirectory: () => Promise<IpcResult<BranchBackupOverview>>;
  setBranchBackupEnabled: (enabled: boolean) => Promise<IpcResult<BranchBackupOverview>>;
  setBranchBackupSelection: (selection: BranchBackupSelection) => Promise<IpcResult<BranchBackupOverview>>;
  backupBranchesNow: (repoPath: string) => Promise<IpcResult<BranchBackupOutcome>>;
  removeBranchBackups: (selection: BranchBackupRemoval) => Promise<IpcResult<number>>;
}
