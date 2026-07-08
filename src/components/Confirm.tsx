import React from 'react';
import { DialogFrame } from './DialogFrame';
import { useI18n } from '../i18n';

export interface DialogContextItem {
  label: string;
  value: string;
}

interface ConfirmProps {
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
  confirmVariant?: 'default' | 'danger';
  secondaryActionVariant?: 'default' | 'danger';
}

export const Confirm: React.FC<ConfirmProps> = ({
  open,
  title,
  message,
  contextItems = [],
  irreversible = false,
  consequences,
  confirmLabel,
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
      onClose={onCancel}
      onConfirm={onConfirm}
      onEnter={onConfirm}
      confirmLabel={confirmLabel ?? t('generated.components.confirm.continue_f7e20a9a')}
      secondaryActionLabel={secondaryActionLabel}
      cancelLabel={cancelLabel ?? t('generated.components.confirm.cancel_035b7526')}
      confirmVariant={confirmVariant}
      secondaryActionVariant={secondaryActionVariant}
      onSecondaryAction={onSecondaryAction}
    >
      <p className="dialog-message">{message}</p>
      {contextItems.length > 0 && (
        <dl className="dialog-context-list">
          {contextItems.map((item) => (
            <React.Fragment key={`${item.label}-${item.value}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      <div className="dialog-impact">
        <span>
          {t('generated.components.confirm.irreversible_6920e2ad')}: <strong>{irreversible ? t('generated.components.confirm.yes_f3b8387d') : t('generated.components.confirm.no_52682a7b')}</strong>
        </span>
        {consequences && <span>{consequences}</span>}
      </div>
    </DialogFrame>
  );
};
