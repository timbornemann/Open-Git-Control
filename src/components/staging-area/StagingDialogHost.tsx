import { ActionToastViewport } from '../ActionToastViewport';
import { Confirm } from '../Confirm';
import { DangerConfirm } from '../DangerConfirm';
import { Input } from '../Input';
import type { ToastMessage } from '../../types/git';
import type { ConfirmDialogState, InputDialogState } from './types';

type ToastEntry = ToastMessage & { id: number };

type StagingDialogHostProps = {
  toasts: ToastEntry[];
  onDismissToast: (id: number) => void;
  confirmDialog: ConfirmDialogState | null;
  inputDialog: InputDialogState | null;
  executeConfirmDialog: () => Promise<void>;
  closeConfirmDialog: () => void;
  executeInputDialog: (values: Record<string, string>) => Promise<void>;
  closeInputDialog: () => void;
};

export const StagingDialogHost: React.FC<StagingDialogHostProps> = ({
  toasts,
  onDismissToast,
  confirmDialog,
  inputDialog,
  executeConfirmDialog,
  closeConfirmDialog,
  executeInputDialog,
  closeInputDialog,
}) => (
  <>
    <ActionToastViewport toasts={toasts} onDismiss={onDismissToast} />

    {confirmDialog && confirmDialog.variant === 'confirm' && (
      <Confirm
        open={true}
        title={confirmDialog.title}
        message={confirmDialog.message}
        contextItems={confirmDialog.contextItems}
        irreversible={confirmDialog.irreversible}
        consequences={confirmDialog.consequences}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={executeConfirmDialog}
        onCancel={closeConfirmDialog}
      />
    )}

    {confirmDialog && confirmDialog.variant === 'danger' && (
      <DangerConfirm
        open={true}
        title={confirmDialog.title}
        message={confirmDialog.message}
        contextItems={confirmDialog.contextItems}
        irreversible={confirmDialog.irreversible}
        consequences={confirmDialog.consequences}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={executeConfirmDialog}
        onCancel={closeConfirmDialog}
      />
    )}

    {inputDialog && (
      <Input
        open={true}
        title={inputDialog.title}
        message={inputDialog.message}
        fields={inputDialog.fields}
        contextItems={inputDialog.contextItems}
        irreversible={inputDialog.irreversible}
        consequences={inputDialog.consequences}
        confirmLabel={inputDialog.confirmLabel}
        onSubmit={executeInputDialog}
        onCancel={closeInputDialog}
      />
    )}
  </>
);
