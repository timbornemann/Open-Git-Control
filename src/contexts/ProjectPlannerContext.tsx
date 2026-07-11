import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerItem, PlannerItemInput, PlannerProject, PlannerProjectInput, ProjectPlannerData } from '@/types/projectPlanner';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { useI18n } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';

type ProjectPlannerContextValue = {
  data: ProjectPlannerData;
  selectedProject: PlannerProject | null;
  selectedProjectId: string | null;
  itemsForSelectedProject: PlannerItem[];
  createProjectRequestId: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  requestCreateProject: () => void;
  requestDeleteProject: (projectId: string) => void;
  requestDeleteItem: (itemId: string) => void;
  selectProject: (projectId: string) => void;
  createProject: (input: PlannerProjectInput) => Promise<PlannerProject | null>;
  updateProject: (projectId: string, input: Partial<PlannerProjectInput>) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<boolean>;
  createItem: (projectId: string, input: PlannerItemInput) => Promise<boolean>;
  updateItem: (itemId: string, input: Partial<PlannerItemInput>) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<boolean>;
  materializeProject: (projectId: string, parentDirectory: string, folderName: string) => Promise<boolean>;
  activateRepositoryProject: (repoPath: string) => Promise<boolean>;
  notify: (message: string, isError: boolean) => void;
  refresh: () => Promise<void>;
};

type ProjectPlannerProviderProps = {
  activeRepo: string | null;
  refreshSignal?: number;
  onRepositorySelected: (repoPath: string) => Promise<void>;
  onRepositoryMaterialized: (repoPath: string) => Promise<void>;
  onToast: (message: string, isError: boolean) => void;
  setConfirmDialog: (state: ConfirmDialogState | null) => void;
  children: React.ReactNode;
};

const EMPTY_DATA: ProjectPlannerData = { version: 1, projects: [], items: [] };
const ProjectPlannerContext = createContext<ProjectPlannerContextValue | null>(null);

const repoKey = normalizeRepoPathKey;

export const ProjectPlannerProvider: React.FC<ProjectPlannerProviderProps> = ({
  activeRepo,
  refreshSignal = 0,
  onRepositorySelected,
  onRepositoryMaterialized,
  onToast,
  setConfirmDialog,
  children,
}) => {
  const { t, tr } = useI18n();
  const [data, setData] = useState<ProjectPlannerData>(EMPTY_DATA);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createProjectRequestId, setCreateProjectRequestId] = useState(0);
  const ensuredRepoRef = useRef<string | null>(null);
  const activeRepoGenerationRef = useRef(0);
  const ensureRequestGenerationRef = useRef(0);
  const refreshRequestGenerationRef = useRef(0);

  useEffect(() => {
    activeRepoGenerationRef.current += 1;
    ensureRequestGenerationRef.current += 1;
    refreshRequestGenerationRef.current += 1;
    setSelectedProjectId(null);
  }, [activeRepo]);

  const refreshData = useCallback(async (): Promise<boolean> => {
    const requestGeneration = refreshRequestGenerationRef.current + 1;
    refreshRequestGenerationRef.current = requestGeneration;
    if (!plannerClient.isAvailable()) {
      throw new Error('Die Projektplanung ist im laufenden App-Prozess noch nicht verfuegbar. Bitte Open-Git-Control neu starten.');
    }
    try {
      const result = await plannerClient.getData();
      if (requestGeneration !== refreshRequestGenerationRef.current) return false;
      if (!result.success) {
        throw new Error(result.error);
      }
      setData(result.data);
      setError(null);
      return true;
    } catch (refreshError) {
      if (requestGeneration !== refreshRequestGenerationRef.current) return false;
      const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
      setError(message);
      throw refreshError;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await refreshData();
  }, [refreshData]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await refresh();
      } catch {
        // The visible error state explains how to recover.
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [refresh]);

  useEffect(() => {
    if (!plannerClient.isAvailable()) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: () => void = () => {};
    try {
      unsubscribe = plannerClient.onDataChanged(() => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          void refresh().catch(() => {
            // The visible error state explains how to recover.
          });
        }, 25);
      });
    } catch {
      // A renderer kept alive across a development preload rebuild may not yet
      // expose the event. The regular refresh path remains available.
      return;
    }
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!refreshSignal) return;
    void refresh().catch(() => {
      // The visible error state explains how to recover.
    });
  }, [refresh, refreshSignal]);

  useEffect(() => {
    if (!activeRepo || !plannerClient.isAvailable()) return;
    const key = repoKey(activeRepo);
    if (ensuredRepoRef.current === key) return;
    const repoGeneration = activeRepoGenerationRef.current;
    const ensureGeneration = ensureRequestGenerationRef.current + 1;
    ensureRequestGenerationRef.current = ensureGeneration;
    const isCurrentEnsure = () => repoGeneration === activeRepoGenerationRef.current && ensureGeneration === ensureRequestGenerationRef.current;

    const ensure = async () => {
      try {
        const result = await plannerClient.ensureRepositoryProject(activeRepo);
        if (!isCurrentEnsure()) return;
        if (!result.success) {
          setError(result.error);
          return;
        }
        ensuredRepoRef.current = key;
        const refreshed = await refreshData();
        if (!isCurrentEnsure() || !refreshed) return;
        setSelectedProjectId(result.data.id);
      } catch (ensureError) {
        if (!isCurrentEnsure()) return;
        setError(ensureError instanceof Error ? ensureError.message : String(ensureError));
      }
    };
    void ensure();

    return () => {
      if (ensureRequestGenerationRef.current === ensureGeneration) {
        ensureRequestGenerationRef.current += 1;
      }
    };
  }, [activeRepo, refreshData, refreshSignal]);

  useEffect(() => {
    if (loading || selectedProjectId) return;
    const activeProject = activeRepo ? data.projects.find((project) => project.repoPath && repoKey(project.repoPath) === repoKey(activeRepo)) : null;
    setSelectedProjectId(activeProject?.id || data.projects[0]?.id || null);
  }, [activeRepo, data.projects, loading, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!data.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(data.projects[0]?.id || null);
    }
  }, [data.projects, selectedProjectId]);

  const runMutation = useCallback(
    async <T,>(operation: () => Promise<{ success: true; data: T } | { success: false; error: string }>): Promise<T | null> => {
      setBusy(true);
      setError(null);
      try {
        const result = await operation();
        if (!result.success) {
          setError(result.error);
          onToast(result.error, true);
          return null;
        }
        try {
          await refresh();
        } catch (refreshError) {
          const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
          // The write succeeded. Report the refresh problem without turning
          // the mutation into a false failure that users may retry.
          onToast(tr(`Aenderung gespeichert, Aktualisierung fehlgeschlagen: ${message}`, `Change saved, but refresh failed: ${message}`), true);
        }
        return result.data;
      } catch (mutationError) {
        const message = mutationError instanceof Error ? mutationError.message : String(mutationError);
        setError(message);
        onToast(message, true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onToast, refresh, tr],
  );

  const createProject = useCallback(
    async (input: PlannerProjectInput) => {
      if (!plannerClient.isAvailable()) {
        const message = 'Die Projektplanung ist im laufenden App-Prozess noch nicht verfuegbar. Bitte Open-Git-Control neu starten.';
        setError(message);
        onToast(message, true);
        return null;
      }
      const project = await runMutation(() => plannerClient.createProject(input));
      if (project) setSelectedProjectId(project.id);
      return project;
    },
    [onToast, runMutation],
  );

  const updateProject = useCallback(
    async (projectId: string, input: Partial<PlannerProjectInput>) => {
      if (!plannerClient.isAvailable()) return false;
      return Boolean(await runMutation(() => plannerClient.updateProject(projectId, input)));
    },
    [runMutation],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!plannerClient.isAvailable()) return false;
      const result = await runMutation(() => plannerClient.deleteProject(projectId));
      return Boolean(result);
    },
    [runMutation],
  );

  const createItem = useCallback(
    async (projectId: string, input: PlannerItemInput) => {
      if (!plannerClient.isAvailable()) return false;
      return Boolean(await runMutation(() => plannerClient.createItem(projectId, input)));
    },
    [runMutation],
  );

  const updateItem = useCallback(
    async (itemId: string, input: Partial<PlannerItemInput>) => {
      if (!plannerClient.isAvailable()) return false;
      return Boolean(await runMutation(() => plannerClient.updateItem(itemId, input)));
    },
    [runMutation],
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!plannerClient.isAvailable()) return false;
      return Boolean(await runMutation(() => plannerClient.deleteItem(itemId)));
    },
    [runMutation],
  );

  const requestDeleteProject = useCallback(
    (projectId: string) => {
      const project = data.projects.find((candidate) => candidate.id === projectId);
      if (!project) return;
      const itemCount = data.items.filter((item) => item.projectId === projectId).length;
      const isPlannedProject = project.kind === 'planned';

      setConfirmDialog({
        variant: 'danger',
        title: isPlannedProject
          ? t('generated.contexts.projectplannercontext.delete_project_idea_9116ddf5')
          : t('generated.contexts.projectplannercontext.delete_planning_data_fa92b687'),
        message: isPlannedProject
          ? t('generated.contexts.projectplannercontext.the_future_project_and_all_related_ideas_will_be_removed_b6147253')
          : t('generated.contexts.projectplannercontext.the_planning_data_will_be_removed_the_repository_and_its_64f80fc8'),
        contextItems: [
          { label: t('generated.contexts.projectplannercontext.project_fc877701'), value: project.name },
          { label: t('generated.contexts.projectplannercontext.items_334c7d10'), value: String(itemCount) },
        ],
        irreversible: true,
        consequences: t('generated.contexts.projectplannercontext.deleted_planning_data_cannot_be_restored_c65a170b'),
        confirmLabel: isPlannedProject
          ? t('generated.components.project_planner.plannerdialogs.delete_project_idea_b471802f')
          : t('generated.components.project_planner.plannerdialogs.delete_planning_data_2c761284'),
        onConfirm: async () => {
          await deleteProject(projectId);
        },
      });
    },
    [data.items, data.projects, deleteProject, setConfirmDialog, t],
  );

  const requestDeleteItem = useCallback(
    (itemId: string) => {
      const item = data.items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      const project = data.projects.find((candidate) => candidate.id === item.projectId);

      setConfirmDialog({
        variant: 'danger',
        title: t('generated.contexts.projectplannercontext.delete_item_e3fbac1b'),
        message: t('generated.contexts.projectplannercontext.the_selected_item_will_be_permanently_removed_from_proje_cf6c54ee'),
        contextItems: [
          { label: t('generated.contexts.projectplannercontext.item_177db219'), value: item.title },
          ...(project ? [{ label: t('generated.contexts.projectplannercontext.project_fc877701'), value: project.name }] : []),
        ],
        irreversible: true,
        consequences: t('generated.contexts.projectplannercontext.the_deleted_item_cannot_be_restored_8ab41906'),
        confirmLabel: t('generated.components.project_planner.projectplannerview.delete_item_afc7d611'),
        onConfirm: async () => {
          await deleteItem(itemId);
        },
      });
    },
    [data.items, data.projects, deleteItem, setConfirmDialog, t],
  );

  const materializeProject = useCallback(
    async (projectId: string, parentDirectory: string, folderName: string) => {
      if (!plannerClient.isAvailable()) return false;
      const result = await runMutation(() => plannerClient.materializeProject(projectId, parentDirectory, folderName));
      if (!result) return false;
      setSelectedProjectId(result.project.id);
      try {
        await onRepositoryMaterialized(result.repoPath);
      } catch (activationError: unknown) {
        const message = activationError instanceof Error ? activationError.message : String(activationError);
        // Materialization is already persisted at this point. Treat a
        // follow-up workspace activation failure as a partial success so a
        // retry cannot create a duplicate repository or report the write as
        // failed.
        onToast(tr(`Repository erstellt, aber nicht aktiviert: ${message}`, `Repository was created, but could not be activated: ${message}`), true);
      }
      return true;
    },
    [onRepositoryMaterialized, onToast, runMutation, tr],
  );

  const selectedProject = useMemo(() => data.projects.find((project) => project.id === selectedProjectId) || null, [data.projects, selectedProjectId]);

  const selectProject = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      const project = data.projects.find((candidate) => candidate.id === projectId);
      if (project?.repoPath && (!activeRepo || repoKey(project.repoPath) !== repoKey(activeRepo))) {
        void onRepositorySelected(project.repoPath);
      }
    },
    [activeRepo, data.projects, onRepositorySelected],
  );

  const requestCreateProject = useCallback(() => {
    setCreateProjectRequestId((current) => current + 1);
  }, []);

  const activateRepositoryProject = useCallback(
    async (repoPath: string) => {
      try {
        if (!activeRepo || repoKey(activeRepo) !== repoKey(repoPath)) {
          await onRepositorySelected(repoPath);
        }
        return true;
      } catch (activationError) {
        const message = activationError instanceof Error ? activationError.message : String(activationError);
        onToast(message, true);
        return false;
      }
    },
    [activeRepo, onRepositorySelected, onToast],
  );

  const notify = useCallback(
    (message: string, isError: boolean) => {
      onToast(message, isError);
    },
    [onToast],
  );

  const itemsForSelectedProject = useMemo(
    () => (selectedProjectId ? data.items.filter((item) => item.projectId === selectedProjectId) : []),
    [data.items, selectedProjectId],
  );

  const value = useMemo<ProjectPlannerContextValue>(
    () => ({
      data,
      selectedProject,
      selectedProjectId,
      itemsForSelectedProject,
      createProjectRequestId,
      loading,
      busy,
      error,
      requestCreateProject,
      requestDeleteProject,
      requestDeleteItem,
      selectProject,
      createProject,
      updateProject,
      deleteProject,
      createItem,
      updateItem,
      deleteItem,
      materializeProject,
      activateRepositoryProject,
      notify,
      refresh,
    }),
    [
      busy,
      createItem,
      createProject,
      createProjectRequestId,
      data,
      activateRepositoryProject,
      deleteItem,
      deleteProject,
      error,
      itemsForSelectedProject,
      loading,
      materializeProject,
      notify,
      refresh,
      requestCreateProject,
      requestDeleteItem,
      requestDeleteProject,
      selectedProject,
      selectedProjectId,
      selectProject,
      updateItem,
      updateProject,
    ],
  );

  return <ProjectPlannerContext.Provider value={value}>{children}</ProjectPlannerContext.Provider>;
};

export const useProjectPlanner = (): ProjectPlannerContextValue => {
  const value = useContext(ProjectPlannerContext);
  if (!value) throw new Error('useProjectPlanner must be used within ProjectPlannerProvider');
  return value;
};
