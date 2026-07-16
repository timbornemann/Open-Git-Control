import React from 'react';
import { FeedbackReportDialog, type FeedbackDialogRequest } from '@/components/feedback/FeedbackReportDialog';
import { useGitHubStore, useSettingsStore, useUIStore } from '@/contexts/AppStateContext';
import { appClient } from '@/services/appClient';
import type { FeedbackReportAreaDto, FeedbackReportCapabilityDto, FeedbackReportCategoryDto } from '@/types/feedbackDtos';

export type FeedbackToast = { id: number; msg: string; isError: boolean };
export type FeedbackToastStatus = { state: 'idle' | 'reported'; issueNumber?: number; htmlUrl?: string };

type FeedbackReportContextValue = {
  capability: FeedbackReportCapabilityDto | null;
  openManualReport: (category: FeedbackReportCategoryDto, request?: Partial<FeedbackDialogRequest>) => void;
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

export const FeedbackReportProvider = ({ children }: { children: React.ReactNode }) => {
  const activeTab = useUIStore((state) => state.activeTab);
  const githubHost = useSettingsStore((state) => state.settings.githubHost);
  const githubAuthenticated = useGitHubStore((state) => state.isAuthenticated);
  const appDialogOpen = useUIStore((state) => Boolean(state.confirmDialog || state.inputDialog));
  const [capability, setCapability] = React.useState<FeedbackReportCapabilityDto | null>(null);
  const [dialogRequest, setDialogRequest] = React.useState<FeedbackDialogRequest | null>(null);
  const [toastStatuses, setToastStatuses] = React.useState<Record<number, FeedbackToastStatus>>({});

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
  }, [githubAuthenticated, githubHost, refreshCapability]);

  const setToastStatus = React.useCallback((id: number, status: FeedbackToastStatus) => {
    setToastStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const openManualReport = React.useCallback(
    (category: FeedbackReportCategoryDto, request: Partial<FeedbackDialogRequest> = {}) => {
      setDialogRequest({ category, source: request.source || 'settings', area: request.area || areaForTab(activeTab), ...request });
    },
    [activeTab],
  );

  const handleToastAction = React.useCallback(
    (toast: FeedbackToast) => {
      const status = toastStatuses[toast.id];
      if (status?.state === 'reported' && status.htmlUrl) {
        void appClient.openExternalUrl(status.htmlUrl);
        return;
      }
      openManualReport('bug', { source: 'error-toast', errorMessage: toast.msg, toastId: toast.id, area: areaForTab(activeTab) });
    },
    [activeTab, openManualReport, toastStatuses],
  );

  const value = React.useMemo<FeedbackReportContextValue>(
    () => ({
      capability,
      openManualReport,
      getToastStatus: (id) => toastStatuses[id] || { state: 'idle' },
      handleToastAction,
    }),
    [capability, handleToastAction, openManualReport, toastStatuses],
  );

  return (
    <FeedbackReportContext.Provider value={value}>
      {children}
      {!appDialogOpen && dialogRequest && (
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
