import { DialogContextItem } from '../Confirm';
import { InputDialogField } from '../Input';

export type ConfirmDialogState = {
  variant: 'confirm' | 'danger';
  title: string;
  message: string;
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

export type InputDialogState = {
  title: string;
  message: string;
  fields: InputDialogField[];
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

export type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

export type RemoteStatusInfo = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};
