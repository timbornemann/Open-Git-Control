import type { IpcResult } from '../../../types/ipc';
import type { PlannerItem, PlannerItemInput, PlannerProject, PlannerProjectInput, ProjectPlannerData } from '../../../types/projectPlanner';
import type {
  PlannerWorkRequest,
  PlannerWorkGetRequest,
  PlannerWorkInspection,
  PlannerStartWorkRequest,
  PlannerStartWorkResult,
  PlannerWorkDetails,
  PlannerUpdateWorkRequest,
} from '../../../types/plannerWork';

export interface ElectronPlannerAPI {
  plannerInspectWork: (request: PlannerWorkRequest) => Promise<IpcResult<PlannerWorkInspection>>;
  plannerStartWork: (request: PlannerStartWorkRequest) => Promise<IpcResult<PlannerStartWorkResult>>;
  plannerGetWork: (request: PlannerWorkGetRequest) => Promise<IpcResult<PlannerWorkDetails>>;
  plannerRefreshWork: (request: PlannerWorkRequest) => Promise<IpcResult<PlannerWorkDetails>>;
  plannerUpdateWork: (request: PlannerUpdateWorkRequest) => Promise<IpcResult<PlannerItem>>;
  plannerGetData: () => Promise<IpcResult<ProjectPlannerData>>;
  onPlannerDataChanged: (callback: () => void) => () => void;
  plannerEnsureRepositoryProject: (repoPath: string) => Promise<IpcResult<PlannerProject>>;
  plannerCreateProject: (input: PlannerProjectInput) => Promise<IpcResult<PlannerProject>>;
  plannerUpdateProject: (projectId: string, input: Partial<PlannerProjectInput>) => Promise<IpcResult<PlannerProject>>;
  plannerDeleteProject: (projectId: string) => Promise<IpcResult<boolean>>;
  plannerDeleteRepositoryProjectByPath: (repoPath: string) => Promise<IpcResult<{ deletedProjectCount: number; deletedItemCount: number }>>;
  plannerCreateItem: (projectId: string, input: PlannerItemInput) => Promise<IpcResult<PlannerItem>>;
  plannerUpdateItem: (itemId: string, input: Partial<PlannerItemInput>) => Promise<IpcResult<PlannerItem>>;
  plannerDeleteItem: (itemId: string) => Promise<IpcResult<boolean>>;
  plannerMaterializeProject: (
    projectId: string,
    parentDirectory: string,
    folderName: string,
  ) => Promise<IpcResult<{ project: PlannerProject; repoPath: string }>>;
}
