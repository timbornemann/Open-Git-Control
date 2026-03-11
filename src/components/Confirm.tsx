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
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmVariant?: 'default' | 'danger';
}

export const Confirm: React.FC<ConfirmProps> = ({
  open,
  title,
  message,
  contextItems = [],
  irreversible = false,
  consequences,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmVariant = 'default',
}) => {
  const { tr } = useI18n();

  return (
    <DialogFrame
      open={open}
      title={title}
      onClose={onCancel}
      onConfirm={onConfirm}
      onEnter={onConfirm}
      confirmLabel={confirmLabel ?? tr('Fortfahren', 'Continue')}
      cancelLabel={cancelLabel ?? tr('Abbrechen', 'Cancel')}
      confirmVariant={confirmVariant}
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
          {tr('Irreversibel', 'Irreversible')}: <strong>{irreversible ? tr('Ja', 'Yes') : tr('Nein', 'No')}</strong>
        </span>
        {consequences && <span>{consequences}</span>}
      </div>
    </DialogFrame>
  );
};
