import React from 'react';
import { Confirm, DialogContextItem } from './Confirm';
import { useI18n } from '../i18n';

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
}) => {
  const { tr } = useI18n();

  return (
    <Confirm
      open={open}
      title={title}
      message={message}
      contextItems={contextItems}
      irreversible={irreversible}
      consequences={consequences}
      confirmLabel={confirmLabel ?? tr('Trotzdem ausführen', 'Run anyway')}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmVariant="danger"
    />
  );
};
