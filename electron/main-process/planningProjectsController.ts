import {
  createPlannedProject,
  createPlannerItem,
  deletePlannerProject,
  readProjectPlannerData,
  updatePlannerProject,
} from './projectPlannerStore';
import { RequestContext } from './planningApiTypes';
import {
  cleanString,
  findProjectById,
  getProjects,
  getTodoById,
  getTodos,
  itemInputFromBody,
  queryOptionsFromUrl,
  summarizeProject,
} from './planningApiDomain';
import {
  RouteHandlerResult,
  routeHandled,
  routeNotHandled,
} from './planningApiControllerTypes';

export const handleProjectsRoute = async (ctx: RequestContext): Promise<RouteHandlerResult> => {
  const [, resource, idOrAction, nested] = ctx.segments;
  if (resource !== 'projects') return routeNotHandled;

  if (!idOrAction && ctx.method === 'GET') return routeHandled({ projects: getProjects(ctx.url) });
  if (!idOrAction && ctx.method === 'POST') {
    return routeHandled(createPlannedProject({
      name: cleanString(ctx.body.name),
      description: cleanString(ctx.body.description),
    }));
  }
  if (idOrAction && !nested && ctx.method === 'GET') {
    const data = readProjectPlannerData();
    return routeHandled({
      project: summarizeProject(findProjectById(idOrAction), data.items),
      todos: getTodos(queryOptionsFromUrl(ctx.url, { projectId: idOrAction })),
    });
  }
  if (idOrAction && !nested && ctx.method === 'PATCH') {
    return routeHandled(updatePlannerProject(idOrAction, {
      name: 'name' in ctx.body ? cleanString(ctx.body.name) : undefined,
      description: 'description' in ctx.body ? cleanString(ctx.body.description) : undefined,
    }));
  }
  if (idOrAction && !nested && ctx.method === 'DELETE') {
    deletePlannerProject(idOrAction);
    return routeHandled({ deleted: true });
  }
  if (idOrAction && nested === 'todos' && ctx.method === 'GET') {
    findProjectById(idOrAction);
    return routeHandled({ todos: getTodos(queryOptionsFromUrl(ctx.url, { projectId: idOrAction })) });
  }
  if (idOrAction && nested === 'todos' && ctx.method === 'POST') {
    findProjectById(idOrAction);
    const item = createPlannerItem(idOrAction, itemInputFromBody(ctx.body));
    return routeHandled(getTodoById(item.id));
  }

  return routeNotHandled;
};
