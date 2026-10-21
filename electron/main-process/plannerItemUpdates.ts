import { ApiError } from './planningApiTypes';
import { activePlannerBranch, pausePlannerAutomation } from '../../src/shared/plannerWork';
import {
  cleanPlannerText,
  isPlannerPriority,
  isPlannerStatus,
  normalizePlannerTags,
  type ProjectPlannerData,
  type PlannerItemInput,
  type PlannerItem,
} from './projectPlannerData';

export type PlannerItemUpdateOptions = { projectId?: string };
export function updatePlannerItemInData(
  data: ProjectPlannerData,
  itemId: string,
  input: Partial<PlannerItemInput>,
  options: PlannerItemUpdateOptions = {},
): PlannerItem {
  const index = data.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new ApiError(404, 'TODO_NOT_FOUND', 'Todo not found.');
  const current = data.items[index];
  if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== current.updatedAt)
    throw new ApiError(409, 'TASK_CHANGED', 'The task changed. Reconcile your draft before saving.');
  const title = input.title === undefined ? current.title : cleanPlannerText(input.title, 240);
  if (!title) throw new ApiError(400, 'TITLE_REQUIRED', 'Item title is required.');
  const projectId = options.projectId === undefined ? current.projectId : cleanPlannerText(options.projectId, 100);
  if (!data.projects.some((project) => project.id === projectId)) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  const updated: PlannerItem = {
    ...current,
    projectId,
    title,
    description: input.description === undefined ? current.description : cleanPlannerText(input.description, 20_000),
    priority: input.priority !== undefined && isPlannerPriority(input.priority) ? input.priority : current.priority,
    status: input.status !== undefined && isPlannerStatus(input.status) ? input.status : current.status,
    tags: input.tags === undefined ? current.tags : normalizePlannerTags(input.tags),
    ...(input.status !== undefined && input.status !== current.status && activePlannerBranch(current)
      ? {
          references: pausePlannerAutomation(current),
        }
      : {}),
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  };
  data.items = data.items.map((item, itemIndex) => (itemIndex === index ? updated : item));
  return updated;
}
