import type { IpcResult } from '../../types/ipc';

export type WorkingTreeWatchRequest = { repoPath: string; subscriptionId: string; enabled: boolean };
export type WorkingTreeChange = { repoPath: string; rescan?: boolean };
export interface WorkingTreeWatchApi {
  watchWorkingTree(request: WorkingTreeWatchRequest): Promise<IpcResult<{ recursive: boolean }>>;
  onWorkingTreeChanged(callback: (change: WorkingTreeChange) => void): () => void;
}
