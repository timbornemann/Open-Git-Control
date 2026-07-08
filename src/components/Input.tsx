import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DialogContextItem } from './Confirm';
import { DialogFrame } from './DialogFrame';
import { useI18n } from '@/i18n';

export interface InputDialogField {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  helperText?: string;
  multiline?: boolean;
  rows?: number;
  type?: 'text' | 'url';
  validate?: (value: string, values: Record<string, string>) => string | null;
}

interface InputProps {
  open: boolean;
  title: string;
  message?: string;
  fields: InputDialogField[];
  contextItems?: DialogContextItem[];
  irreversible?: boolean;
  consequences?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export const Input: React.FC<InputProps> = ({
  open,
  title,
  message,
  fields,
  contextItems = [],
  irreversible = false,
  consequences,
  confirmLabel,
  cancelLabel,
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const { t, tr } = useI18n();

  const initialValues = useMemo(() => {
    const nextValues: Record<string, string> = {};
    fields.forEach((field) => {
      nextValues[field.id] = field.defaultValue ?? '';
    });
    return nextValues;
  }, [fields]);

  useEffect(() => {
    if (!open) return;
    setValues(initialValues);
  }, [open, initialValues]);

  const validationError = useMemo(() => {
    for (const field of fields) {
      const value = values[field.id] ?? '';
      if (field.required && !value.trim()) {
        return tr(`Bitte "${field.label}" ausfüllen.`, `Please fill "${field.label}".`);
      }
      if (field.validate) {
        const customError = field.validate(value, values);
        if (customError) return customError;
      }
    }
    return null;
  }, [fields, tr, values]);

  const handleSubmit = () => {
    if (validationError) return;
    onSubmit(values);
  };

  return (
    <DialogFrame
      open={open}
      title={title}
      onClose={onCancel}
      onConfirm={handleSubmit}
      onEnter={handleSubmit}
      confirmLabel={confirmLabel ?? t('generated.components.input.save_b6a0ea4a')}
      cancelLabel={cancelLabel ?? t('generated.components.confirm.cancel_035b7526')}
      confirmDisabled={Boolean(validationError)}
      initialFocusRef={firstInputRef as React.RefObject<HTMLElement | null>}
    >
      {message && <p className="dialog-message">{message}</p>}
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
      <div className="dialog-inputs">
        {fields.map((field, index) => (
          <label key={field.id} className="dialog-field">
            <span>{field.label}</span>
            {field.multiline ? (
              <textarea
                ref={index === 0 ? (firstInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                placeholder={field.placeholder}
                value={values[field.id] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
                rows={field.rows ?? 3}
              />
            ) : (
              <input
                ref={index === 0 ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                type={field.type ?? 'text'}
                placeholder={field.placeholder}
                value={values[field.id] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
              />
            )}
            {field.helperText && <small>{field.helperText}</small>}
          </label>
        ))}
      </div>
      {validationError && <div className="dialog-validation">{validationError}</div>}
      <div className="dialog-impact">
        <span>
          {t('generated.components.confirm.irreversible_6920e2ad')}:{' '}
          <strong>{irreversible ? t('generated.components.confirm.yes_f3b8387d') : t('generated.components.confirm.no_52682a7b')}</strong>
        </span>
        {consequences && <span>{consequences}</span>}
      </div>
    </DialogFrame>
  );
};
