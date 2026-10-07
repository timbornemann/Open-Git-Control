import React, { useCallback } from 'react';
import { useI18n } from '@/i18n';
import { useOptionalFeedbackReport } from '@/contexts/FeedbackReportContext';
import { AlertCircle, Check, Info, Loader2, X } from 'lucide-react';
import type { NotificationEntry } from '@/types/notifications';
import '@/styles/action-toast.css';

export type ActionToastItem = NotificationEntry;

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

export const ActionToastViewport: React.FC<ActionToastViewportProps> = ({ toasts, onDismiss }) => {
  const { t } = useI18n();
  const feedback = useOptionalFeedbackReport();
  const handleCopy = useCallback((message: string) => {
    void copyMessage(message);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const kind = toast.kind ?? (toast.isError ? 'error' : 'success');
        const Icon = kind === 'progress' ? Loader2 : kind === 'info' ? Info : kind === 'warning' ? AlertCircle : toast.isError ? X : Check;
        return (
          <div key={toast.id} className={`action-toast ${kind}`} role={toast.isError ? 'alert' : 'status'}>
            <div className="toast-main">
              <Icon size={16} className={`toast-icon${kind === 'progress' ? ' toast-icon-spin' : ''}`} aria-hidden="true" />
              <div className="toast-msg">
                {toast.title && <strong className="toast-title">{toast.title}</strong>}
                <span>{toast.msg}</span>
                {toast.detail && <span className="toast-detail">{toast.detail}</span>}
              </div>
            </div>
            {toast.progress && (
              <div className="toast-progress">
                <div
                  className={`toast-progress-track${toast.progress.value === null ? ' indeterminate' : ''}`}
                  role="progressbar"
                  aria-label={toast.progress.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={toast.progress.value === null ? undefined : toast.progress.value}
                >
                  <span className="toast-progress-fill" style={toast.progress.value === null ? undefined : { width: `${toast.progress.value}%` }} />
                </div>
                {toast.progress.value !== null && (
                  <span className="toast-progress-value" aria-hidden="true">
                    {toast.progress.value}%
                  </span>
                )}
              </div>
            )}
            <div className="toast-actions">
              {toast.isError && (
                <>
                  <button
                    type="button"
                    className="toast-action-btn"
                    onClick={() => handleCopy(toast.msg)}
                    title={t('generated.components.actiontoastviewport.copy_error_message_6863792c')}
                  >
                    {t('generated.components.actiontoastviewport.copy_5c2a9afe')}
                  </button>
                  {feedback && (
                    <button type="button" className="toast-action-btn toast-action-btn-report" onClick={() => feedback.handleToastAction(toast)}>
                      {feedback.getToastStatus(toast.id).state === 'reported'
                        ? feedbackLabel('reported', t, feedback.getToastStatus(toast.id).issueNumber)
                        : feedbackLabel('idle', t)}
                    </button>
                  )}
                </>
              )}
              {toast.actions?.map((action) => (
                <button key={action.label} type="button" className="toast-action-btn" disabled={action.disabled} onClick={action.onClick}>
                  {action.label}
                </button>
              ))}
              {onDismiss && toast.dismissible !== false && (
                <button
                  type="button"
                  className="toast-action-btn toast-action-btn-close"
                  onClick={() => onDismiss(toast.id)}
                  title={t('generated.components.actiontoastviewport.close_message_73bd3641')}
                >
                  {t('generated.components.actiontoastviewport.close_181764fa')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const feedbackLabel = (state: 'idle' | 'reported', t: ReturnType<typeof useI18n>['t'], issueNumber?: number): string => {
  if (state === 'reported') return issueNumber ? t('feedback.openIssueNumber', { number: issueNumber }) : t('feedback.openIssue');
  return t('feedback.quickReport');
};
