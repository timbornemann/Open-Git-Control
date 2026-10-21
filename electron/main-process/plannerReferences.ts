import type { PlannerItemReferences, PlannerRepositoryReference } from '../../src/types/projectPlanner';

const text = (value: unknown, max = 2000): string => {
  if (typeof value !== 'string' || !value || value.length > max || /[\r\n\0]/.test(value)) throw new Error('Invalid planner reference.');
  return value;
};
const repository = (value: PlannerRepositoryReference): PlannerRepositoryReference => {
  if (!value || !['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'].includes(value.provider))
    throw new Error('Invalid hosting provider.');
  const server = new URL(text(value.server));
  if (!['https:', 'http:'].includes(server.protocol) || server.username || server.password || server.search || server.hash)
    throw new Error('Invalid hosting server.');
  if (/^[\\/]|[\\:]/.test(value.fullPath) || value.fullPath.split('/').includes('..')) throw new Error('Invalid portable repository identity.');
  return { provider: value.provider, server: server.href.replace(/\/+$/, ''), repositoryId: text(value.repositoryId, 1000), fullPath: text(value.fullPath) };
};

export function normalizePlannerReferences(value: unknown): PlannerItemReferences | undefined {
  if (value === undefined) return undefined;
  const source = value as PlannerItemReferences;
  if (!source || !Array.isArray(source.branches) || !Array.isArray(source.pullRequests) || source.branches.length > 100 || source.pullRequests.length > 200)
    throw new Error('Invalid planner references.');
  const branches = source.branches.map((branch) => {
    if (!branch || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(branch.baseSha) || !Number.isFinite(branch.startedAt))
      throw new Error('Invalid planner branch reference.');
    if (/^[/-]|[\\:]/.test(branch.name) || !/^refs\/(heads|remotes)\//.test(branch.baseRef)) throw new Error('Invalid portable Git reference.');
    if (
      branch.previousNames &&
      (!Array.isArray(branch.previousNames) || branch.previousNames.length > 100 || branch.previousNames.some((name) => /^[/-]|[\\:]/.test(text(name, 1024))))
    )
      throw new Error('Invalid previous branch names.');
    return {
      id: text(branch.id, 100),
      projectId: text(branch.projectId, 100),
      name: text(branch.name, 1024),
      ...(branch.previousNames ? { previousNames: [...new Set(branch.previousNames)] } : {}),
      baseRef: text(branch.baseRef, 1024),
      baseSha: branch.baseSha,
      startedAt: branch.startedAt,
      automationPaused: branch.automationPaused === true,
      ...(branch.repository ? { repository: repository(branch.repository) } : {}),
      ...(branch.completedBy ? { completedBy: text(branch.completedBy) } : {}),
    };
  });
  if (new Set(branches.map((branch) => branch.id)).size !== branches.length) throw new Error('Duplicate planner workflow.');
  const activeWorkflowId = source.activeWorkflowId === undefined ? undefined : text(source.activeWorkflowId, 100);
  if (activeWorkflowId && !branches.some((branch) => branch.id === activeWorkflowId)) throw new Error('Unknown active planner workflow.');
  const pullRequests = source.pullRequests.map((reference) => {
    if (!branches.some((branch) => branch.id === reference.workflowId)) throw new Error('Unknown change request workflow.');
    const url = new URL(text(reference.url, 4096));
    const scope = repository(reference);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.origin !== new URL(scope.server).origin)
      throw new Error('Invalid change request URL.');
    return { ...scope, workflowId: text(reference.workflowId, 100), id: text(reference.id, 1000), number: text(reference.number, 100), url: url.href };
  });
  return { ...(activeWorkflowId ? { activeWorkflowId } : {}), branches, pullRequests };
}
