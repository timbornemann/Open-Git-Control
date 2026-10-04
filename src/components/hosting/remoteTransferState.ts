import { create } from 'zustand';
import type { GitPushBatchDto, GitPushPlanDto, GitRemoteSnapshotDto, RemotePreferences, RemoteTransferOperations } from '@/types/remoteTransfers';
import type { SecretScanResultDto } from '@/types/gitDtos';
import type { RemoteTransferDialog } from './remoteTransferDialogState';

export interface RemoteTransferSelection {
  selectedRemoteNames: string[];
  branch: string;
  targetBranches: Record<string, string>;
  tagNames: string[];
  profileId?: string | null;
}
export interface RemoteTransferState {
  phase: 'idle' | 'preparing' | 'selection' | 'review' | 'running' | 'result';
  busy: boolean;
  intent: RemoteTransferDialog | null;
  snapshot: GitRemoteSnapshotDto | null;
  preferences: RemotePreferences;
  selection: RemoteTransferSelection;
  reason: string;
  plan: GitPushPlanDto | null;
  scan: SecretScanResultDto | null;
  batch: GitPushBatchDto | null;
  failedPull: RemoteTransferOperations['pull']['input'] | null;
  retrying: boolean;
  error: string;
  resultVisible: boolean;
}
export const initialRemoteTransferState = (): RemoteTransferState => ({
  phase: 'idle',
  busy: false,
  intent: null,
  snapshot: null,
  preferences: {},
  selection: { selectedRemoteNames: [], branch: '', targetBranches: {}, tagNames: [] },
  reason: '',
  plan: null,
  scan: null,
  batch: null,
  failedPull: null,
  retrying: false,
  error: '',
  resultVisible: true,
});
export const useRemoteTransferState = create<RemoteTransferState>(() => initialRemoteTransferState());
