import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { normalizeRepoPathKey } from '@/utils/repoPath';

type AnalyticsToolbar = {
  repoPath: string;
  savedAt?: number;
  running: boolean;
  paused: boolean;
  failed: boolean;
  hasWarnings: boolean;
  reload: () => void;
  cancel: () => void;
  showCoverage: () => void;
};
type Registration = AnalyticsToolbar & { owner: symbol };

// The dashboard owns the analysis; the main header only displays its current controls.
export const useAnalyticsToolbarState = create<{ current: Registration | null }>(() => ({ current: null }));

export function usePublishAnalyticsToolbar({ repoPath, savedAt, running, paused, failed, hasWarnings, reload, cancel, showCoverage }: AnalyticsToolbar) {
  const owner = useRef(Symbol('analytics-toolbar')).current;
  useEffect(() => {
    useAnalyticsToolbarState.setState({ current: { owner, repoPath, savedAt, running, paused, failed, hasWarnings, reload, cancel, showCoverage } });
  }, [owner, repoPath, savedAt, running, paused, failed, hasWarnings, reload, cancel, showCoverage]);
  useEffect(
    () => () => {
      if (useAnalyticsToolbarState.getState().current?.owner === owner) useAnalyticsToolbarState.setState({ current: null });
    },
    [owner],
  );
}

export function useAnalyticsToolbar(repoPath: string | null) {
  const key = repoPath ? normalizeRepoPathKey(repoPath) : '';
  return useAnalyticsToolbarState((state) => (state.current && normalizeRepoPathKey(state.current.repoPath) === key ? state.current : null));
}
