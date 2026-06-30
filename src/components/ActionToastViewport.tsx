import React, { useCallback } from 'react';
import { useI18n } from '../i18n';

export type ActionToastItem = {
  id: number;
  msg: string;
  isError: boolean;
};

type ActionToastViewportProps = {
  toasts: ActionToastItem[];
  onDismiss?: (id: number) => void;
};

const copyMessage = async (message: string) => {
  const text = String(message || '');
  if (!text) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fallback below
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.focus();
  area.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore fallback copy errors
  } finally {
    document.body.removeChild(area);
  }
};

export const ActionToastViewport: React.FC<ActionToastViewportProps> = ({
  toasts,
  onDismiss,
}) => {
  const { tr } = useI18n();
  const handleCopy = useCallback((message: string) => {
    void copyMessage(message);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`action-toast ${toast.isError ? 'error' : 'success'}`}
          role={toast.isError ? 'alert' : 'status'}
        >
          <div className="toast-main">
            <span className="toast-icon">{toast.isError ? 'x' : 'ok'}</span>
            <span className="toast-msg">{toast.msg}</span>
          </div>
          <div className="toast-actions">
            {toast.isError && (
              <button
                type="button"
                className="toast-action-btn"
                onClick={() => handleCopy(toast.msg)}
                title={tr('Fehlermeldung kopieren', 'Copy error message')}
              >
                {tr('Kopieren', 'Copy')}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                className="toast-action-btn toast-action-btn-close"
                onClick={() => onDismiss(toast.id)}
                title={tr('Meldung schliessen', 'Close message')}
              >
                {tr('Schliessen', 'Close')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
