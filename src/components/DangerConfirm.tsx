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
  secondaryActionLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onSecondaryAction?: () => void;
  onCancel: () => void;
  secondaryActionVariant?: 'default' | 'danger';
}

export const DangerConfirm: React.FC<DangerConfirmProps> = ({
  open,
  title,
  message,
  contextItems = [],
  irreversible = true,
  consequences,
  confirmLabel,
  secondaryActionLabel,
  cancelLabel,
  onConfirm,
  onSecondaryAction,
  onCancel,
  secondaryActionVariant = 'default',
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
      secondaryActionLabel={secondaryActionLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      onSecondaryAction={onSecondaryAction}
      onCancel={onCancel}
      confirmVariant="danger"
      secondaryActionVariant={secondaryActionVariant}
    />
  );
};
