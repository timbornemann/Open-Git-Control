import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerItem, PlannerItemInput, PlannerProject, PlannerProjectInput, ProjectPlannerData } from '@/types/projectPlanner';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { useI18n } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';

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

const repoKey = (repoPath: string): string => {
  const normalized = repoPath.replace(/[\\/]+$/, '');
  return /^win/i.test(navigator.platform) ? normalized.toLocaleLowerCase() : normalized;
};

export const ProjectPlannerProvider: React.FC<ProjectPlannerProviderProps> = ({
  activeRepo,
  refreshSignal = 0,
  onRepositorySelected,
  onRepositoryMaterialized,
  onToast,
  setConfirmDialog,
  children,
}) => {
  const { t } = useI18n();
  const [data, setData] = useState<ProjectPlannerData>(EMPTY_DATA);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createProjectRequestId, setCreateProjectRequestId] = useState(0);
  const ensuredRepoRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!plannerClient.isAvailable()) {
      throw new Error('Die Projektplanung ist im laufenden App-Prozess noch nicht verfuegbar. Bitte Open-Git-Control neu starten.');
    }
    try {
      const result = await plannerClient.getData();
      if (!result.success) {
        throw new Error(result.error);
      }
      setData(result.data);
      setError(null);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
      setError(message);
      throw refreshError;
    }
  }, []);

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
    if (!refreshSignal) return;
    void refresh().catch(() => {
      // The visible error state explains how to recover.
    });
  }, [refresh, refreshSignal]);

  useEffect(() => {
    if (!activeRepo || !plannerClient.isAvailable()) return;
    const key = repoKey(activeRepo);
    if (ensuredRepoRef.current === key) return;
    ensuredRepoRef.current = key;

    const ensure = async () => {
      const result = await plannerClient.ensureRepositoryProject(activeRepo);
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refresh();
      setSelectedProjectId(result.data.id);
    };
    void ensure();
  }, [activeRepo, refresh]);

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
        await refresh();
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
    [onToast, refresh],
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
      await onRepositoryMaterialized(result.repoPath);
      return true;
    },
    [onRepositoryMaterialized, runMutation],
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
      refresh,
    }),
    [
      busy,
      createItem,
      createProject,
      createProjectRequestId,
      data,
      deleteItem,
      deleteProject,
      error,
      itemsForSelectedProject,
      loading,
      materializeProject,
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
