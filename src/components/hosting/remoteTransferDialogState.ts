import { create } from 'zustand';

export type RemoteTransferDialog = {
  repoPath: string;
  requestId?: string;
  mode: 'remotes' | 'push' | 'pull' | 'fetch';
  force?: boolean;
  pullMode?: 'default' | 'rebase' | 'no-ff' | 'ff-only';
  destinationBranch?: string;
  sourceBranch?: string;
  expectedBranch?: string;
  expectedSourceOid?: string;
  constrainedRemoteNames?: string[];
  constrainedTargetUrls?: Record<string, string[]>;
  tagNames?: string[];
  selectTags?: boolean;
};
export const useRemoteTransferDialogState = create<{
  dialog: RemoteTransferDialog | null;
  cancelledRequest: string | null;
  cancelRequest: (id: string | null) => void;
  open: (dialog: RemoteTransferDialog) => void;
  close: () => void;
}>((set) => ({
  dialog: null,
  cancelledRequest: null,
  cancelRequest: (cancelledRequest) => set((state) => ({ cancelledRequest, ...(state.dialog?.requestId === cancelledRequest ? { dialog: null } : {}) })),
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

export const openRemoteTransferDialog = (dialog: RemoteTransferDialog) => useRemoteTransferDialogState.getState().open(dialog);

/** Every interactive transfer enters the same coordinator; this is not a forced dialog. */
export const requestRemoteTransfer = openRemoteTransferDialog;
