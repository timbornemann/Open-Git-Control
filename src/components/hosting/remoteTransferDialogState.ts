import { create } from 'zustand';

export type RemoteTransferDialog = {
  repoPath: string;
  mode: 'remotes' | 'push' | 'pull' | 'fetch';
  force?: boolean;
  pullMode?: 'default' | 'rebase' | 'no-ff' | 'ff-only';
  destinationBranch?: string;
};
export const useRemoteTransferDialogState = create<{ dialog: RemoteTransferDialog | null; open: (dialog: RemoteTransferDialog) => void; close: () => void }>(
  (set) => ({
    dialog: null,
    open: (dialog) => set({ dialog }),
    close: () => set({ dialog: null }),
  }),
);

export const openRemoteTransferDialog = (dialog: RemoteTransferDialog) => useRemoteTransferDialogState.getState().open(dialog);
