import React, { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import './dialog.css';
import { registerOpenDialog } from './ui/notificationDialogs';

interface DialogFrameProps {
  open: boolean;
  title: string;
  className?: string;
  onClose: () => void;
  onConfirm?: () => void;
  onSecondaryAction?: () => void;
  onEnter?: () => void;
  confirmLabel?: string;
  secondaryActionLabel?: string;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  confirmDisabled?: boolean;
  secondaryActionDisabled?: boolean;
  confirmVariant?: 'default' | 'danger';
  secondaryActionVariant?: 'default' | 'danger';
  closeOnBackdrop?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  focusConfirm?: boolean;
  focusCancel?: boolean;
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

let nextDialogId = 0;
const openDialogIds: number[] = [];

export const DialogFrame: React.FC<DialogFrameProps> = ({
  open,
  title,
  className,
  onClose,
  onConfirm,
  onSecondaryAction,
  onEnter,
  confirmLabel,
  secondaryActionLabel,
  cancelLabel,
  cancelDisabled = false,
  confirmDisabled = false,
  secondaryActionDisabled = false,
  confirmVariant = 'default',
  secondaryActionVariant = 'default',
  closeOnBackdrop = true,
  initialFocusRef,
  focusConfirm = false,
  focusCancel = false,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogIdRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const onEnterRef = useRef(onEnter);
  const { t } = useI18n();
  if (dialogIdRef.current === null) dialogIdRef.current = ++nextDialogId;

  useEffect(() => {
    onCloseRef.current = onClose;
    onEnterRef.current = onEnter;
  }, [onClose, onEnter]);

  useEffect(() => {
    if (!open) return;
    const dialogId = dialogIdRef.current;
    if (dialogId === null) return;
    openDialogIds.push(dialogId);
    const unregister = registerOpenDialog(dialogId);

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusDialog = window.setTimeout(() => {
      const preferred = initialFocusRef?.current ?? (focusCancel ? cancelRef.current : focusConfirm ? confirmRef.current : null);
      if (preferred) {
        preferred.focus();
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      focusable?.[0]?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogIds.at(-1) !== dialogId) return;
      if (!dialogRef.current) return;
      if (event.defaultPrevented || event.isComposing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Enter' && !event.repeat && onEnterRef.current) {
        const target = event.target as HTMLElement | null;
        if (target && dialogRef.current.contains(target) && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON' && !target.dataset.dialogNoEnter) {
          event.preventDefault();
          onEnterRef.current();
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
      const index = openDialogIds.lastIndexOf(dialogId);
      if (index >= 0) openDialogIds.splice(index, 1);
      previousFocusRef.current?.focus();
      unregister();
    };
  }, [open, initialFocusRef, focusConfirm, focusCancel]);

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
        className={['dialog-modal', className].filter(Boolean).join(' ')}
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
          <button ref={cancelRef} className="dialog-btn dialog-btn-secondary" data-dialog-action="cancel" onClick={onClose} disabled={cancelDisabled}>
            {cancelLabel ?? t('generated.components.confirm.cancel_035b7526')}
          </button>
          {onSecondaryAction && (
            <button
              data-dialog-action="secondary"
              className={`dialog-btn ${secondaryActionVariant === 'danger' ? 'dialog-btn-danger' : 'dialog-btn-secondary'}`}
              onClick={onSecondaryAction}
              disabled={secondaryActionDisabled}
            >
              {secondaryActionLabel ?? t('generated.components.dialogframe.run_alternative_fd1645c6')}
            </button>
          )}
          {onConfirm && (
            <button
              ref={confirmRef}
              data-dialog-action="confirm"
              className={`dialog-btn ${confirmVariant === 'danger' ? 'dialog-btn-danger' : 'dialog-btn-primary'}`}
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              {confirmLabel ?? t('generated.components.dialogframe.confirm_e0731ced')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
