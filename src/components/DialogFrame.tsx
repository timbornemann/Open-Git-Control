import React, { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import './dialog.css';

interface DialogFrameProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  onEnter?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmVariant?: 'default' | 'danger';
  closeOnBackdrop?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const DialogFrame: React.FC<DialogFrameProps> = ({
  open,
  title,
  onClose,
  onConfirm,
  onEnter,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  confirmVariant = 'default',
  closeOnBackdrop = true,
  initialFocusRef,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { tr } = useI18n();

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusDialog = window.setTimeout(() => {
      const preferred = initialFocusRef?.current;
      if (preferred) {
        preferred.focus();
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      focusable?.[0]?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Enter' && onEnter) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName !== 'TEXTAREA' && !target?.dataset.dialogNoEnter) {
          event.preventDefault();
          onEnter();
          return;
        }
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusDialog);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose, onEnter, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onMouseDown={() => {
        if (closeOnBackdrop) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h3>{title}</h3>
        </div>
        <div className="dialog-content">{children}</div>
        <div className="dialog-footer">
          <button className="dialog-btn dialog-btn-secondary" onClick={onClose}>
            {cancelLabel ?? tr('Abbrechen', 'Cancel')}
          </button>
          {onConfirm && (
            <button
              className={`dialog-btn ${confirmVariant === 'danger' ? 'dialog-btn-danger' : 'dialog-btn-primary'}`}
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              {confirmLabel ?? tr('Bestätigen', 'Confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
