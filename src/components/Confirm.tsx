import React from 'react';
import { DialogFrame } from './DialogFrame';
import { useI18n } from '@/i18n';
import type { DialogContextItem } from '@/app/state/contracts';
import { DialogContext, DialogImpact, DialogMessage } from './DialogSections';

export type { DialogContextItem } from '@/app/state/contracts';

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  contextItems?: DialogContextItem[];
  contextAction?: { label: string; onClick: () => void };
  irreversible?: boolean;
  consequences?: string;
  confirmLabel?: string;
  focusConfirm?: boolean;
  secondaryActionLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onSecondaryAction?: () => void;
  onCancel: () => void;
  confirmVariant?: 'default' | 'danger';
  secondaryActionVariant?: 'default' | 'danger';
}

export const Confirm: React.FC<ConfirmProps> = ({
  open,
  title,
  message,
  contextAction,
  contextItems = [],
  irreversible = false,
  consequences,
  confirmLabel,
  focusConfirm,
  secondaryActionLabel,
  cancelLabel,
  onConfirm,
  onSecondaryAction,
  onCancel,
  confirmVariant = 'default',
  secondaryActionVariant = 'default',
}) => {
  const { t } = useI18n();

  return (
    <DialogFrame
      open={open}
      title={title}
      className="dialog-decision"
      onClose={onCancel}
      onConfirm={onConfirm}
      onEnter={onConfirm}
      focusConfirm={focusConfirm}
      focusCancel={!focusConfirm && (confirmVariant === 'danger' || irreversible)}
      confirmLabel={confirmLabel ?? t('generated.components.confirm.continue_f7e20a9a')}
      secondaryActionLabel={secondaryActionLabel}
      cancelLabel={cancelLabel ?? t('generated.components.confirm.cancel_035b7526')}
      confirmVariant={confirmVariant}
      secondaryActionVariant={secondaryActionVariant}
      onSecondaryAction={onSecondaryAction}
    >
      <DialogMessage danger={confirmVariant === 'danger' || irreversible}>{message}</DialogMessage>
      <DialogContext items={contextItems} action={contextAction} />
      <DialogImpact irreversible={irreversible} consequences={consequences} />
    </DialogFrame>
  );
};
