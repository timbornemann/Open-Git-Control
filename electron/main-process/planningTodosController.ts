import { createPlannerItem, deletePlannerItem } from './projectPlannerStore';
import type { RequestContext } from './planningApiTypes';
import {
  getTodoById,
  getTodos,
  itemInputFromBody,
  moveTodoFromBody,
  queryOptionsFromUrl,
  resolveProjectLocator,
  updateTodoFromBody,
} from './planningApiDomain';
import type { RouteHandlerResult } from './planningApiControllerTypes';
import { routeHandled, routeNotHandled } from './planningApiControllerTypes';

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
    return routeHandled(updateTodoFromBody(idOrAction, ctx.body));
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
