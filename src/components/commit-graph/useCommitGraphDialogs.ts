import { useCallback, useState } from 'react';
import { useOptionalUIContext } from '../../contexts/AppStateContext';
import type { ConfirmDialogState, InputDialogState } from '../layout/layoutTypes';

export const useCommitGraphDialogs = () => {
  const uiContext = useOptionalUIContext();
  const [localConfirmDialog, setLocalConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [localInputDialog, setLocalInputDialog] = useState<InputDialogState | null>(null);
  const setConfirmDialog = uiContext?.setConfirmDialog ?? setLocalConfirmDialog;
  const setInputDialog = uiContext?.setInputDialog ?? setLocalInputDialog;
  const confirmDialog = uiContext ? null : localConfirmDialog;
  const inputDialog = uiContext ? null : localInputDialog;

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), [setConfirmDialog]);

  const executeConfirmDialog = useCallback(async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }, [confirmDialog, setConfirmDialog]);

  const closeInputDialog = useCallback(() => setInputDialog(null), [setInputDialog]);

  const executeInputDialog = useCallback(async (values: Record<string, string>) => {
    if (!inputDialog) return;
    const action = inputDialog.onSubmit;
    setInputDialog(null);
    await action(values);
  }, [inputDialog, setInputDialog]);

  return {
    confirmDialog,
    inputDialog,
    setConfirmDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    closeInputDialog,
    executeInputDialog,
  };
};
