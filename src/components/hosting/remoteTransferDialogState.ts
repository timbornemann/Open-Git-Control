import { create } from 'zustand';

export type RemoteTransferDialog = {
  repoPath: string;
  mode: 'remotes' | 'push' | 'pull' | 'fetch';
  force?: boolean;
  pullMode?: 'default' | 'rebase' | 'no-ff' | 'ff-only';
  destinationBranch?: string;
  expectedBranch?: string;
  expectedSourceOid?: string;
  constrainedRemoteNames?: string[];
  constrainedTargetUrls?: Record<string, string[]>;
  tagNames?: string[];
  selectTags?: boolean;
};
export const useRemoteTransferDialogState = create<{ dialog: RemoteTransferDialog | null; open: (dialog: RemoteTransferDialog) => void; close: () => void }>(
  (set) => ({
    dialog: null,
    open: (dialog) => set({ dialog }),
    close: () => set({ dialog: null }),
  }),
);

export const openRemoteTransferDialog = (dialog: RemoteTransferDialog) => useRemoteTransferDialogState.getState().open(dialog);

/** Every interactive transfer enters the same coordinator; this is not a forced dialog. */
export const requestRemoteTransfer = openRemoteTransferDialog;
