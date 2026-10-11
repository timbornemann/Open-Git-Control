import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storageClient } from '@/services/storageClient';
import { isRepositoryUiPreferences } from '@/shared/ipc/repositoryUiPreferences';
import { onRepositoryLocationChanged } from '@/services/repositoryLocationBus';
import { normalizeRepoPathKey } from '@/utils/repoPath';
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
  const [sidebarGeneralCollapseState, setSidebarGeneralCollapseState] = useState<SidebarGeneralCollapseState>(DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE);
  const desktop = storageClient.hasUiPreferences();
  const generation = useRef(0);

  useEffect(
    () =>
      onRepositoryLocationChanged(({ oldPath, newPath }) => {
        setSidebarCollapseByRepo((previous) => {
          const oldKey = Object.keys(previous).find((key) => normalizeRepoPathKey(key) === normalizeRepoPathKey(oldPath));
          if (!oldKey) return previous;
          const next = { ...previous, [newPath]: previous[oldKey] };
          if (oldKey !== newPath) delete next[oldKey];
          return next;
        });
      }),
    [],
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
    if (!desktop) return;
    let live = true;
    const refresh = async () => {
      const current = generation.current;
      try {
        const raw = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY);
        let legacy;
        try {
          const value = raw ? JSON.parse(raw) : undefined;
          if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isRepositoryUiPreferences)) legacy = value;
        } catch {
          /* Unknown legacy data stays in its original storage. */
        }
        const result = await storageClient.uiPreferences(legacy);
        if (!result.success) throw new Error(result.error);
        if (!live || generation.current !== current) return;
        setSidebarCollapseByRepo(result.data);
        if (legacy) {
          localStorage.removeItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
          localStorage.removeItem(LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY);
        }
      } catch (error) {
        console.warn('Repository UI preferences were preserved:', error);
      }
    };
    void refresh();
    const unsubscribe = storageClient.isAvailable() ? storageClient.subscribe(() => void refresh()) : () => {};
    return () => {
      live = false;
      unsubscribe();
    };
  }, [desktop, activeRepo]);

  useEffect(() => {
    if (desktop) return;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(sidebarCollapseByRepo));
    } catch {
      // ignore write errors (e.g. private mode / quota)
    }
  }, [sidebarCollapseByRepo, desktop]);

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
    const key = activeRepo && Object.keys(sidebarCollapseByRepo).find((repo) => normalizeRepoPathKey(repo) === normalizeRepoPathKey(activeRepo));
    return key ? { ...DEFAULT_SIDEBAR_COLLAPSE_STATE, ...sidebarCollapseByRepo[key] } : DEFAULT_SIDEBAR_COLLAPSE_STATE;
  }, [activeRepo, sidebarCollapseByRepo]);

  const updateActiveRepoSidebarCollapse = useCallback(
    (partial: Partial<SidebarCollapseState>) => {
      if (!activeRepo) return;
      const request = ++generation.current;

      setSidebarCollapseByRepo((prev) => {
        const key = Object.keys(prev).find((repo) => normalizeRepoPathKey(repo) === normalizeRepoPathKey(activeRepo)) || activeRepo;
        const current = { ...DEFAULT_SIDEBAR_COLLAPSE_STATE, ...(prev[key] || {}) };
        return {
          ...prev,
          [key]: {
            ...current,
            ...partial,
          },
        };
      });
      if (desktop)
        void storageClient
          .updateUiPreferences({ repoPath: activeRepo, patch: partial })
          .then((result) => {
            if (!result.success) throw new Error(result.error);
            if (generation.current === request) setSidebarCollapseByRepo(result.data);
          })
          .catch((error) => console.warn('Repository UI preferences could not be saved:', error));
    },
    [activeRepo, desktop],
  );

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
