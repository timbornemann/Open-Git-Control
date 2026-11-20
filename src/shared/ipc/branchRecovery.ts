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
  repoPath: string;
  checkedAt: number | null;
  verifiedAt: number | null;
  lastError: string | null;
}

export interface BranchBackupOverview {
  enabled: boolean;
  directory: string | null;
  repositories: BranchBackupStatus[];
}

export interface ElectronBranchRecoveryAPI {
  getRepositoryHead: (repoPath: string) => Promise<IpcResult<RepositoryHead>>;
  inspectBranchRecovery: (repoPath: string) => Promise<IpcResult<BranchRecoveryInspection | null>>;
  repairBranch: (request: RepairBranchRequest) => Promise<IpcResult<{ oid: string } | null>>;
}

export interface ElectronBranchBackupAPI {
  getBranchBackupOverview: () => Promise<IpcResult<BranchBackupOverview>>;
  chooseBranchBackupDirectory: () => Promise<IpcResult<BranchBackupOverview>>;
  setBranchBackupEnabled: (enabled: boolean) => Promise<IpcResult<BranchBackupOverview>>;
}
