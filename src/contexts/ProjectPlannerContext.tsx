import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PlannerItem,
  PlannerItemInput,
  PlannerProject,
  PlannerProjectInput,
  ProjectPlannerData,
} from '../types/projectPlanner';
import { ConfirmDialogState } from '../components/layout/layoutTypes';
import { useI18n } from '../i18n';

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
  materializeProject: (
    projectId: string,
    parentDirectory: string,
    folderName: string,
  ) => Promise<boolean>;
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
  const { tr } = useI18n();
  const [data, setData] = useState<ProjectPlannerData>(EMPTY_DATA);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createProjectRequestId, setCreateProjectRequestId] = useState(0);
  const ensuredRepoRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.plannerGetData) {
      throw new Error(
        'Die Projektplanung ist im laufenden App-Prozess noch nicht verfuegbar. Bitte Open-Git-Control neu starten.',
      );
    }
    try {
      const result = await window.electronAPI.plannerGetData();
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
    if (!activeRepo || !window.electronAPI?.plannerEnsureRepositoryProject) return;
    const key = repoKey(activeRepo);
    if (ensuredRepoRef.current === key) return;
    ensuredRepoRef.current = key;

    const ensure = async () => {
      const result = await window.electronAPI.plannerEnsureRepositoryProject(activeRepo);
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
    const activeProject = activeRepo
      ? data.projects.find((project) => project.repoPath && repoKey(project.repoPath) === repoKey(activeRepo))
      : null;
    setSelectedProjectId(activeProject?.id || data.projects[0]?.id || null);
  }, [activeRepo, data.projects, loading, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!data.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(data.projects[0]?.id || null);
    }
  }, [data.projects, selectedProjectId]);

  const runMutation = useCallback(async <T,>(
    operation: () => Promise<{ success: true; data: T } | { success: false; error: string }>,
  ): Promise<T | null> => {
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
  }, [onToast, refresh]);

  const createProject = useCallback(async (input: PlannerProjectInput) => {
    if (!window.electronAPI?.plannerCreateProject) {
      const message = 'Die Projektplanung ist im laufenden App-Prozess noch nicht verfuegbar. Bitte Open-Git-Control neu starten.';
      setError(message);
      onToast(message, true);
      return null;
    }
    const project = await runMutation(() => window.electronAPI.plannerCreateProject(input));
    if (project) setSelectedProjectId(project.id);
    return project;
  }, [runMutation]);

  const updateProject = useCallback(async (projectId: string, input: Partial<PlannerProjectInput>) => {
    if (!window.electronAPI) return false;
    return Boolean(await runMutation(() => window.electronAPI.plannerUpdateProject(projectId, input)));
  }, [runMutation]);

  const deleteProject = useCallback(async (projectId: string) => {
    if (!window.electronAPI) return false;
    const result = await runMutation(() => window.electronAPI.plannerDeleteProject(projectId));
    return Boolean(result);
  }, [runMutation]);

  const createItem = useCallback(async (projectId: string, input: PlannerItemInput) => {
    if (!window.electronAPI) return false;
    return Boolean(await runMutation(() => window.electronAPI.plannerCreateItem(projectId, input)));
  }, [runMutation]);

  const updateItem = useCallback(async (itemId: string, input: Partial<PlannerItemInput>) => {
    if (!window.electronAPI) return false;
    return Boolean(await runMutation(() => window.electronAPI.plannerUpdateItem(itemId, input)));
  }, [runMutation]);

  const deleteItem = useCallback(async (itemId: string) => {
    if (!window.electronAPI) return false;
    return Boolean(await runMutation(() => window.electronAPI.plannerDeleteItem(itemId)));
  }, [runMutation]);

  const requestDeleteProject = useCallback((projectId: string) => {
    const project = data.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const itemCount = data.items.filter((item) => item.projectId === projectId).length;
    const isPlannedProject = project.kind === 'planned';

    setConfirmDialog({
      variant: 'danger',
      title: isPlannedProject
        ? tr('Projektidee loeschen?', 'Delete project idea?')
        : tr('Planungsdaten loeschen?', 'Delete planning data?'),
      message: isPlannedProject
        ? tr(
          'Das zukuenftige Projekt und alle zugehoerigen Ideen werden aus der Projektplanung entfernt.',
          'The future project and all related ideas will be removed from project planning.',
        )
        : tr(
          'Die Planungsdaten werden entfernt. Das Repository und seine Dateien bleiben unveraendert.',
          'The planning data will be removed. The repository and its files remain unchanged.',
        ),
      contextItems: [
        { label: tr('Projekt', 'Project'), value: project.name },
        { label: tr('Eintraege', 'Items'), value: String(itemCount) },
      ],
      irreversible: true,
      consequences: tr(
        'Die geloeschten Planungsdaten koennen nicht wiederhergestellt werden.',
        'Deleted planning data cannot be restored.',
      ),
      confirmLabel: isPlannedProject
        ? tr('Projektidee loeschen', 'Delete project idea')
        : tr('Planungsdaten loeschen', 'Delete planning data'),
      onConfirm: async () => {
        await deleteProject(projectId);
      },
    });
  }, [data.items, data.projects, deleteProject, setConfirmDialog, tr]);

  const requestDeleteItem = useCallback((itemId: string) => {
    const item = data.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const project = data.projects.find((candidate) => candidate.id === item.projectId);

    setConfirmDialog({
      variant: 'danger',
      title: tr('Eintrag loeschen?', 'Delete item?'),
      message: tr(
        'Der ausgewaehlte Eintrag wird dauerhaft aus der Projektplanung entfernt.',
        'The selected item will be permanently removed from project planning.',
      ),
      contextItems: [
        { label: tr('Eintrag', 'Item'), value: item.title },
        ...(project ? [{ label: tr('Projekt', 'Project'), value: project.name }] : []),
      ],
      irreversible: true,
      consequences: tr(
        'Der geloeschte Eintrag kann nicht wiederhergestellt werden.',
        'The deleted item cannot be restored.',
      ),
      confirmLabel: tr('Eintrag loeschen', 'Delete item'),
      onConfirm: async () => {
        await deleteItem(itemId);
      },
    });
  }, [data.items, data.projects, deleteItem, setConfirmDialog, tr]);

  const materializeProject = useCallback(async (
    projectId: string,
    parentDirectory: string,
    folderName: string,
  ) => {
    if (!window.electronAPI) return false;
    const result = await runMutation(() => (
      window.electronAPI.plannerMaterializeProject(projectId, parentDirectory, folderName)
    ));
    if (!result) return false;
    setSelectedProjectId(result.project.id);
    await onRepositoryMaterialized(result.repoPath);
    return true;
  }, [onRepositoryMaterialized, runMutation]);

  const selectedProject = useMemo(() => (
    data.projects.find((project) => project.id === selectedProjectId) || null
  ), [data.projects, selectedProjectId]);

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    const project = data.projects.find((candidate) => candidate.id === projectId);
    if (project?.repoPath && (!activeRepo || repoKey(project.repoPath) !== repoKey(activeRepo))) {
      void onRepositorySelected(project.repoPath);
    }
  }, [activeRepo, data.projects, onRepositorySelected]);

  const requestCreateProject = useCallback(() => {
    setCreateProjectRequestId((current) => current + 1);
  }, []);

  const itemsForSelectedProject = useMemo(() => (
    selectedProjectId
      ? data.items.filter((item) => item.projectId === selectedProjectId)
      : []
  ), [data.items, selectedProjectId]);

  const value = useMemo<ProjectPlannerContextValue>(() => ({
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
  }), [
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
  ]);

  return (
    <ProjectPlannerContext.Provider value={value}>
      {children}
    </ProjectPlannerContext.Provider>
  );
};

export const useProjectPlanner = (): ProjectPlannerContextValue => {
  const value = useContext(ProjectPlannerContext);
  if (!value) throw new Error('useProjectPlanner must be used within ProjectPlannerProvider');
  return value;
};
