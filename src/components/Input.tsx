import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DialogContextItem } from './Confirm';
import { DialogFrame } from './DialogFrame';

export interface InputDialogField {
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  helperText?: string;
  multiline?: boolean;
  type?: 'text' | 'url';
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
  confirmLabel = 'Speichern',
  cancelLabel = 'Abbrechen',
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

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
    setValidationError(null);
  }, [open, initialValues]);

  const handleSubmit = () => {
    for (const field of fields) {
      const value = values[field.id] ?? '';
      if (field.required && !value.trim()) {
        setValidationError(`Bitte "${field.label}" ausfuellen.`);
        return;
      }
    }

    setValidationError(null);
    onSubmit(values);
  };

  return (
    <DialogFrame
      open={open}
      title={title}
      onClose={onCancel}
      onConfirm={handleSubmit}
      onEnter={handleSubmit}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
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
                ref={index === 0 ? firstInputRef as React.RefObject<HTMLTextAreaElement> : undefined}
                placeholder={field.placeholder}
                value={values[field.id] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
                rows={3}
              />
            ) : (
              <input
                ref={index === 0 ? firstInputRef as React.RefObject<HTMLInputElement> : undefined}
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
          Irreversibel: <strong>{irreversible ? 'Ja' : 'Nein'}</strong>
        </span>
        {consequences && <span>{consequences}</span>}
      </div>
    </DialogFrame>
  );
};
