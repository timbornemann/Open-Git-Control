import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SIDEBAR_COLLAPSE_STATE,
  DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE,
  LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY,
  LEGACY_SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY,
  type SidebarCollapseByRepo,
  type SidebarCollapseState,
  type SidebarGeneralCollapseState,
} from './appStateShared';

type UseSidebarCollapseStateParams = {
  activeRepo: string | null;
};

export const useSidebarCollapseState = ({ activeRepo }: UseSidebarCollapseStateParams) => {
  const [sidebarCollapseByRepo, setSidebarCollapseByRepo] = useState<SidebarCollapseByRepo>({});
  const [sidebarGeneralCollapseState, setSidebarGeneralCollapseState] = useState<SidebarGeneralCollapseState>(
    DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE,
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SidebarCollapseByRepo;
      if (parsed && typeof parsed === 'object') {
        setSidebarCollapseByRepo(parsed);
      }
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(sidebarCollapseByRepo));
    } catch {
      // ignore write errors (e.g. private mode / quota)
    }
  }, [sidebarCollapseByRepo]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SidebarGeneralCollapseState>;
      if (!parsed || typeof parsed !== 'object') return;
      setSidebarGeneralCollapseState({
        repoPanelCollapsed: Boolean(parsed.repoPanelCollapsed),
      });
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY, JSON.stringify(sidebarGeneralCollapseState));
    } catch {
      // ignore write errors (e.g. private mode / quota)
    }
  }, [sidebarGeneralCollapseState]);

  const activeSidebarCollapseState = useMemo(() => {
    return activeRepo
      ? ({ ...DEFAULT_SIDEBAR_COLLAPSE_STATE, ...(sidebarCollapseByRepo[activeRepo] || {}) })
      : DEFAULT_SIDEBAR_COLLAPSE_STATE;
  }, [activeRepo, sidebarCollapseByRepo]);

  const updateActiveRepoSidebarCollapse = useCallback((partial: Partial<SidebarCollapseState>) => {
    if (!activeRepo) return;

    setSidebarCollapseByRepo((prev) => {
      const current = { ...DEFAULT_SIDEBAR_COLLAPSE_STATE, ...(prev[activeRepo] || {}) };
      return {
        ...prev,
        [activeRepo]: {
          ...current,
          ...partial,
        },
      };
    });
  }, [activeRepo]);

  const toggleBranchPanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      branchPanelCollapsed: !activeSidebarCollapseState.branchPanelCollapsed,
    });
  }, [activeSidebarCollapseState.branchPanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleTagPanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      tagPanelCollapsed: !activeSidebarCollapseState.tagPanelCollapsed,
    });
  }, [activeSidebarCollapseState.tagPanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleRemotePanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      remotePanelCollapsed: !activeSidebarCollapseState.remotePanelCollapsed,
    });
  }, [activeSidebarCollapseState.remotePanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleSubmodulePanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      submodulePanelCollapsed: !activeSidebarCollapseState.submodulePanelCollapsed,
    });
  }, [activeSidebarCollapseState.submodulePanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleRepoPanelCollapsed = useCallback(() => {
    setSidebarGeneralCollapseState((prev) => ({
      ...prev,
      repoPanelCollapsed: !prev.repoPanelCollapsed,
    }));
  }, []);

  return {
    activeSidebarCollapseState,
    sidebarGeneralCollapseState,
    toggleBranchPanelCollapsed,
    toggleTagPanelCollapsed,
    toggleRemotePanelCollapsed,
    toggleSubmodulePanelCollapsed,
    toggleRepoPanelCollapsed,
  };
};

