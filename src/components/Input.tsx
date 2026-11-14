import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DialogContextItem, InputDialogField } from '@/app/state/contracts';
import { DialogFrame } from './DialogFrame';
import { FolderTreeSelect } from './FolderTreeSelect';
import { useI18n } from '@/i18n';
import { DialogContext, DialogImpact, DialogMessage } from './DialogSections';

export type { InputDialogField } from '@/app/state/contracts';

interface InputProps {
  open: boolean;
  suspended?: boolean;
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
  suspended = false,
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
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const { t, tr } = useI18n();

  const initialValues = useMemo(() => {
    const nextValues: Record<string, string> = {};
    fields.forEach((field) => {
      nextValues[field.id] = field.defaultValue ?? '';
    });
    return nextValues;
  }, [fields]);

  useLayoutEffect(() => {
    if (!open) return;
    setValues(initialValues);
  }, [open, initialValues]);

  const validationError = useMemo(() => {
    for (const field of fields) {
      if (field.visible && !field.visible(values)) continue;
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
      open={open && !suspended}
      title={title}
      className="dialog-decision"
      onClose={onCancel}
      onConfirm={handleSubmit}
      onEnter={handleSubmit}
      confirmLabel={confirmLabel ?? t('generated.components.input.save_b6a0ea4a')}
      cancelLabel={cancelLabel ?? t('generated.components.confirm.cancel_035b7526')}
      confirmDisabled={Boolean(validationError)}
      confirmVariant={irreversible ? 'danger' : 'default'}
      initialFocusRef={firstInputRef as React.RefObject<HTMLElement | null>}
    >
      {message && <DialogMessage danger={irreversible}>{message}</DialogMessage>}
      <DialogContext items={contextItems} />
      <div className="dialog-inputs">
        {fields.map((field, index) => {
          if (field.visible && !field.visible(values)) return null;
          const setValue = (value: string) => setValues((prev) => ({ ...prev, [field.id]: value }));
          if (field.type === 'checkbox') {
            return (
              <label key={field.id} className="dialog-field dialog-checkbox-field" data-dialog-field={field.id}>
                <input
                  ref={index === 0 ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                  type="checkbox"
                  checked={(values[field.id] ?? '') === 'true'}
                  onChange={(event) => setValue(event.target.checked ? 'true' : 'false')}
                />
                <span>{field.label}</span>
                {field.helperText && <small>{field.helperText}</small>}
              </label>
            );
          }

          if (field.type === 'folder-tree') {
            return (
              <div key={field.id} className="dialog-field" data-dialog-field={field.id}>
                <span>{field.label}</span>
                <FolderTreeSelect value={values[field.id] ?? ''} options={field.options || []} loadChildren={field.loadChildren} onChange={setValue} />
                {field.helperText && <small>{field.helperText}</small>}
              </div>
            );
          }

          return (
            <label key={field.id} className="dialog-field" data-dialog-field={field.id}>
              <span>{field.label}</span>
              {field.multiline ? (
                <textarea
                  ref={index === 0 ? (firstInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                  placeholder={field.placeholder}
                  value={values[field.id] ?? ''}
                  onChange={(event) => setValue(event.target.value)}
                  rows={field.rows ?? 3}
                />
              ) : field.type === 'select' ? (
                <select
                  ref={index === 0 ? (firstInputRef as React.RefObject<HTMLSelectElement>) : undefined}
                  value={values[field.id] ?? ''}
                  onChange={(event) => setValue(event.target.value)}
                >
                  {(field.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={index === 0 ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                  type={field.type ?? 'text'}
                  placeholder={field.placeholder}
                  value={values[field.id] ?? ''}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
              {field.helperText && <small>{field.helperText}</small>}
            </label>
          );
        })}
      </div>
      {validationError && <div className="dialog-validation">{validationError}</div>}
      <DialogImpact irreversible={irreversible} consequences={consequences} />
    </DialogFrame>
  );
};
