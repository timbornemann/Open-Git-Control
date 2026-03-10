import React from 'react';
import { Confirm, DialogContextItem } from './Confirm';

interface DangerConfirmProps {
  open: boolean;
  title: string;
  message: string;
  contextItems?: DialogContextItem[];
  irreversible?: boolean;
  consequences?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DangerConfirm: React.FC<DangerConfirmProps> = ({
  open,
  title,
  message,
  contextItems = [],
  irreversible = true,
  consequences,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => (
  <Confirm
    open={open}
    title={title}
    message={message}
    contextItems={contextItems}
    irreversible={irreversible}
    consequences={consequences}
    confirmLabel={confirmLabel ?? 'Trotzdem ausfuehren'}
    cancelLabel={cancelLabel}
    onConfirm={onConfirm}
    onCancel={onCancel}
    confirmVariant="danger"
  />
);
