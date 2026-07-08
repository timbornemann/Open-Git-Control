import {
  createPlannerItem,
  deletePlannerItem,
  readProjectPlannerData,
  updatePlannerItem,
} from './projectPlannerStore';
import { RequestContext } from './planningApiTypes';
import {
  cleanString,
  enrichTodos,
  getTodoById,
  getTodos,
  itemInputFromBody,
  itemUpdateFromBody,
  moveTodoFromBody,
  queryOptionsFromUrl,
  resolveProjectLocator,
} from './planningApiDomain';
import {
  RouteHandlerResult,
  routeHandled,
  routeNotHandled,
} from './planningApiControllerTypes';

export const handleTodosRoute = async (ctx: RequestContext): Promise<RouteHandlerResult> => {
  const [, resource, idOrAction, nested] = ctx.segments;
  if (resource !== 'todos') return routeNotHandled;

  if (!idOrAction && ctx.method === 'GET') {
    return routeHandled({ todos: getTodos(queryOptionsFromUrl(ctx.url)) });
  }
  if (!idOrAction && ctx.method === 'POST') {
    const project = resolveProjectLocator(ctx.body);
    const item = createPlannerItem(project.id, itemInputFromBody(ctx.body));
    return routeHandled(getTodoById(item.id));
  }
  if (idOrAction === 'next' && ctx.method === 'GET') {
    return routeHandled({ todos: getTodos(queryOptionsFromUrl(ctx.url, { includeDone: false, limit: 20 })) });
  }
  if (idOrAction && !nested && ctx.method === 'GET') return routeHandled(getTodoById(idOrAction));
  if (idOrAction && !nested && ctx.method === 'PATCH') {
    const moveProject = cleanString(ctx.body.projectId) || cleanString(ctx.body.repoPath) || cleanString(ctx.body.projectName);
    if (moveProject) moveTodoFromBody(idOrAction, ctx.body);
    const updated = updatePlannerItem(idOrAction, itemUpdateFromBody(ctx.body));
    const data = readProjectPlannerData();
    return routeHandled(enrichTodos([updated], data.projects)[0]);
  }
  if (idOrAction && !nested && ctx.method === 'DELETE') {
    deletePlannerItem(idOrAction);
    return routeHandled({ deleted: true });
  }
  if (idOrAction && nested === 'move' && ctx.method === 'POST') {
    return routeHandled(moveTodoFromBody(idOrAction, ctx.body));
  }

  return routeNotHandled;
};
