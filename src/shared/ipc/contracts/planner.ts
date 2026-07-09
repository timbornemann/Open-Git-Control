import type { IpcResult } from '../../../global';
import type { PlannerItem, PlannerItemInput, PlannerProject, PlannerProjectInput, ProjectPlannerData } from '../../../types/projectPlanner';

export interface ElectronPlannerAPI {
  plannerGetData: () => Promise<IpcResult<ProjectPlannerData>>;
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
