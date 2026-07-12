import React from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { FeedbackReportDialog, type FeedbackDialogRequest } from '@/components/feedback/FeedbackReportDialog';
import { useGitHubStore, useSettingsStore, useUIStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import type { FeedbackReportAreaDto, FeedbackReportCapabilityDto, FeedbackReportCategoryDto } from '@/types/feedbackDtos';

export type FeedbackToast = { id: number; msg: string; isError: boolean };
export type FeedbackToastStatus = { state: 'idle' | 'submitting' | 'reported' | 'failed' | 'suppressed'; issueNumber?: number; htmlUrl?: string };

type FeedbackReportContextValue = {
  capability: FeedbackReportCapabilityDto | null;
  openManualReport: (category: FeedbackReportCategoryDto, request?: Partial<FeedbackDialogRequest>) => void;
  observeErrorToast: (toast: FeedbackToast) => void;
  getToastStatus: (id: number) => FeedbackToastStatus;
  handleToastAction: (toast: FeedbackToast) => void;
};

const FeedbackReportContext = React.createContext<FeedbackReportContextValue | null>(null);

const areaForTab = (tab: string): FeedbackReportAreaDto => {
  if (tab === 'github') return 'GitHub integration';
  if (tab === 'settings') return 'Settings';
  if (tab === 'planner') return 'Project planning';
  if (tab === 'repo') return 'Repository workspace';
  return 'Other';
};

const titleFromError = (message: string): string =>
  message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 140) || 'Application error';

export const FeedbackReportProvider = ({ children }: { children: React.ReactNode }) => {
  const { tr } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const onUpdateSettings = useSettingsStore((state) => state.onUpdateSettings);
  const activeTab = useUIStore((state) => state.activeTab);
  const githubAuthenticated = useGitHubStore((state) => state.isAuthenticated);
  const appDialogOpen = useUIStore((state) => Boolean(state.confirmDialog || state.inputDialog));
  const [capability, setCapability] = React.useState<FeedbackReportCapabilityDto | null>(null);
  const [dialogRequest, setDialogRequest] = React.useState<FeedbackDialogRequest | null>(null);
  const [consentToast, setConsentToast] = React.useState<FeedbackToast | null>(null);
  const [consentAutomatic, setConsentAutomatic] = React.useState(false);
  const [consentError, setConsentError] = React.useState<string | null>(null);
  const [toastStatuses, setToastStatuses] = React.useState<Record<number, FeedbackToastStatus>>({});
  const observedToastIds = React.useRef(new Set<number>());

  const refreshCapability = React.useCallback(async () => {
    if (!appClient.isAvailable()) return null;
    try {
      const next = await appClient.getFeedbackReportCapability();
      setCapability(next);
      return next;
    } catch {
      const unavailable: FeedbackReportCapabilityDto = { directSubmissionAvailable: false, reason: 'not-authenticated' };
      setCapability(unavailable);
      return unavailable;
    }
  }, []);

  React.useEffect(() => {
    void refreshCapability();
  }, [githubAuthenticated, refreshCapability, settings.githubHost]);

  React.useEffect(() => {
    if (consentToast && capability?.directSubmissionAvailable) setConsentAutomatic(true);
  }, [capability?.directSubmissionAvailable, consentToast]);

  const setToastStatus = React.useCallback((id: number, status: FeedbackToastStatus) => {
    setToastStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const submitAutomatic = React.useCallback(
    async (toast: FeedbackToast) => {
      const currentCapability = capability || (await refreshCapability());
      if (!currentCapability?.directSubmissionAvailable) {
        setToastStatus(toast.id, { state: 'failed' });
        return;
      }
      setToastStatus(toast.id, { state: 'submitting' });
      try {
        const result = await appClient.submitFeedbackReport({
          category: 'bug',
          submissionMode: 'automatic',
          source: 'error-toast',
          title: titleFromError(toast.msg),
          area: areaForTab(activeTab),
          errorMessage: toast.msg,
        });
        if (result.success) {
          setToastStatus(toast.id, { state: 'reported', issueNumber: result.data.issueNumber, htmlUrl: result.data.htmlUrl });
        } else {
          setToastStatus(toast.id, { state: result.code === 'RATE_LIMITED' ? 'suppressed' : 'failed' });
        }
      } catch {
        setToastStatus(toast.id, { state: 'failed' });
      }
    },
    [activeTab, capability, refreshCapability, setToastStatus],
  );

  const openManualReport = React.useCallback(
    (category: FeedbackReportCategoryDto, request: Partial<FeedbackDialogRequest> = {}) => {
      setDialogRequest({ category, source: request.source || 'settings', area: request.area || areaForTab(activeTab), ...request });
    },
    [activeTab],
  );

  const observeErrorToast = React.useCallback(
    (toast: FeedbackToast) => {
      if (!toast.isError || observedToastIds.current.has(toast.id)) return;
      observedToastIds.current.add(toast.id);
      if (!settings.errorReportConsentShown) {
        void refreshCapability();
        setConsentAutomatic(Boolean(capability?.directSubmissionAvailable));
        setConsentToast((current) => current || toast);
        return;
      }
      if (settings.automaticErrorReportsEnabled) void submitAutomatic(toast);
    },
    [capability?.directSubmissionAvailable, refreshCapability, settings.automaticErrorReportsEnabled, settings.errorReportConsentShown, submitAutomatic],
  );

  const handleToastAction = React.useCallback(
    (toast: FeedbackToast) => {
      const status = toastStatuses[toast.id];
      if (status?.state === 'reported' && status.htmlUrl) {
        void appClient.openExternalUrl(status.htmlUrl);
        return;
      }
      if (status?.state === 'submitting') return;
      openManualReport('bug', { source: 'error-toast', errorMessage: toast.msg, toastId: toast.id, area: areaForTab(activeTab) });
    },
    [activeTab, openManualReport, toastStatuses],
  );

  const persistConsent = async (automatic: boolean): Promise<boolean> => {
    const result = await onUpdateSettings({ errorReportConsentShown: true, automaticErrorReportsEnabled: automatic });
    if (result && !result.success) {
      setConsentError(result.error);
      return false;
    }
    return true;
  };

  const confirmConsent = async () => {
    if (!consentToast) return;
    setConsentError(null);
    if (!(await persistConsent(consentAutomatic))) return;
    const toast = consentToast;
    setConsentToast(null);
    if (capability?.directSubmissionAvailable) {
      await submitAutomatic(toast);
    } else {
      openManualReport('bug', { source: 'error-toast', errorMessage: toast.msg, toastId: toast.id, area: areaForTab(activeTab) });
    }
  };

  const declineConsent = async () => {
    setConsentError(null);
    if (!(await persistConsent(false))) return;
    setConsentToast(null);
  };

  const value = React.useMemo<FeedbackReportContextValue>(
    () => ({
      capability,
      openManualReport,
      observeErrorToast,
      getToastStatus: (id) => toastStatuses[id] || { state: 'idle' },
      handleToastAction,
    }),
    [capability, handleToastAction, observeErrorToast, openManualReport, toastStatuses],
  );

  return (
    <FeedbackReportContext.Provider value={value}>
      {children}
      {!appDialogOpen && consentToast && (
        <DialogFrame
          open
          title={tr('Fehlerberichte über GitHub', 'Error reports through GitHub')}
          onClose={() => void declineConsent()}
          onConfirm={() => void confirmConsent()}
          confirmLabel={tr('Diesen Fehler melden', 'Report this error')}
          cancelLabel={tr('Nicht melden', 'Do not report')}
          closeOnBackdrop={false}
        >
          <p className="dialog-message">
            {tr(
              'Open-Git-Control kann diesen Fehler als öffentliches Issue auf GitHub melden. Dabei werden dein GitHub-Konto, der redigierte Fehlertext, App-Version, Betriebssystem und App-Bereich sichtbar. Automatische Berichte enthalten keine Diagnosedaten oder Repository-Pfade.',
              'Open-Git-Control can report this error as a public GitHub issue. Your GitHub account, redacted error text, app version, operating system, and app area will be visible. Automatic reports contain no diagnostics or repository paths.',
            )}
          </p>
          <label className="feedback-report-diagnostics-toggle">
            <input
              type="checkbox"
              checked={consentAutomatic}
              disabled={!capability?.directSubmissionAvailable}
              onChange={(event) => setConsentAutomatic(event.target.checked)}
            />
            {tr('Künftige Fehler automatisch melden', 'Automatically report future errors')}
          </label>
          {!capability?.directSubmissionAvailable && (
            <p className="feedback-report-privacy-warning">
              {tr(
                'Automatische Berichte benötigen eine aktive GitHub.com-Anmeldung. Der aktuelle Bericht kann über das Browserformular abgeschlossen werden.',
                'Automatic reports require an active GitHub.com login. The current report can be completed through the browser form.',
              )}
            </p>
          )}
          {consentError && <p className="feedback-report-error">{consentError}</p>}
        </DialogFrame>
      )}
      {!appDialogOpen && !consentToast && dialogRequest && (
        <FeedbackReportDialog
          request={dialogRequest}
          onClose={() => setDialogRequest(null)}
          onReported={(toastId, issue) => {
            if (toastId !== undefined) setToastStatus(toastId, { state: 'reported', ...issue });
          }}
        />
      )}
    </FeedbackReportContext.Provider>
  );
};

export const useFeedbackReport = (): FeedbackReportContextValue => {
  const value = React.useContext(FeedbackReportContext);
  if (!value) throw new Error('useFeedbackReport must be used within FeedbackReportProvider');
  return value;
};

export const useOptionalFeedbackReport = (): FeedbackReportContextValue | null => React.useContext(FeedbackReportContext);
