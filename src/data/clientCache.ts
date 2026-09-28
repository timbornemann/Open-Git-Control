import { cancellableRead } from './ipcRead';
import type { ReadPriority, ResourceDomain, ResourceKey } from '@/shared/cache/resource';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { queryClient, readResource, updateResource, refreshVisibleResources } from './queryClient';
import { isMutation, isReadCommand, readPolicies } from './clientPolicies';
import { gitMutationAffects, gitMutationScope, githubMutationAffects, isImmutableGitRead } from './mutationEffects';
import { readGithubBranches, supportsBranchPages } from './githubBranches';
import type { ProjectPlannerData, PlannerItem, PlannerProject } from '@/types/projectPlanner';

let repositorySelection = 0;
let githubEpoch = 0;
export const getGithubCacheEpoch = () => githubEpoch;
export const invalidateGithubCacheEpoch = () => {
  githubEpoch++;
};
let activeRepository = '';
let githubScope = 'github.com/anonymous';
let priority: ReadPriority = 'visible';
let requireFreshRead = false;
const scopeListeners = new Set<() => void>();
export const subscribeGithubScope = (callback: () => void) => {
  scopeListeners.add(callback);
  return () => {
    scopeListeners.delete(callback);
  };
};
export const getActiveResourceRepository = () => activeRepository;
export const getGithubResourceScope = () => githubScope;
export function setActiveResourceRepository(repo: string | null) {
  const next = repo ? normalizeRepoPathKey(repo) : '';
  if (next === activeRepository) return;
  const previous = activeRepository;
  activeRepository = next;
  void queryClient.cancelQueries({ predicate: (q) => q.queryKey[1] === 'git' && q.queryKey[2] === previous });
}
export function setGithubResourceScope(host: string, username: string | null) {
  const next = `${host.trim().toLowerCase() || 'github.com'}/${username?.toLowerCase() || 'anonymous'}`;
  if (next === githubScope) return;
  githubEpoch++;
  const previous = githubScope;
  githubScope = next;
  void queryClient.cancelQueries({ predicate: (q) => q.queryKey[1] === 'github' && q.queryKey[2] === previous });
  queryClient.removeQueries({ predicate: (q) => q.queryKey[1] === 'github' && q.queryKey[2] === previous });
  scopeListeners.forEach((listener) => listener());
}

export function resourceKey(domain: ResourceDomain, method: string, input: readonly unknown[] = []): ResourceKey {
  let args = [...input];
  const policy = readPolicies[domain][method];
  let scope = domain === 'github' ? githubScope : domain === 'git' || (domain === 'runs' && method !== 'getState') ? activeRepository : 'application';
  if (policy?.repoProperty) {
    const params = (args[0] ?? {}) as { repoPath?: string };
    scope = normalizeRepoPathKey(params.repoPath || activeRepository);
    args[0] = { ...params, repoPath: scope };
  } else if (policy?.repoArgument !== undefined) {
    scope = normalizeRepoPathKey(String(args[policy.repoArgument] || activeRepository));
    args[policy.repoArgument] = scope;
  } else if (domain === 'git' && ['commitOverview', 'blameView', 'treeView'].includes(method)) {
    scope = normalizeRepoPathKey(String(args.shift() || activeRepository));
  } else if (domain === 'git' && method === 'runGitCommandForRepo') {
    scope = normalizeRepoPathKey(String(args.shift()));
    method = 'command';
  } else if (domain === 'git' && method === 'runGitCommand') method = 'command';
  if (method === 'getReleaseContext') {
    const params = (args[0] ?? {}) as { repoPath?: string; targetCommitish?: string };
    args[0] = { ...params, repoPath: normalizeRepoPathKey(params.repoPath || activeRepository), targetCommitish: params.targetCommitish || 'HEAD' };
  }
  if (method === 'listWorkingDirectory' && !args[1]) args = [scope, ''];
  if (method === 'getCommitLogPage') args[0] = { limit: 100, offset: 0, scope: 'head', ...(args[0] as object) };
  if (method === 'getWorkflowRunsPage') args[0] = { page: 1, perPage: 30, ...(args[0] as object) };
  return ['resource', domain, scope, method, ...args];
}

export function peekResource<T>(domain: ResourceDomain, method: string, args: readonly unknown[] = []) {
  return queryClient.getQueryData<T>(resourceKey(domain, method, args));
}

/** Priority is captured synchronously by the client adapter, never kept across
 * an await. Concurrent foreground work therefore cannot inherit it. */
export function withReadPriority<T>(operation: () => T, requested: ReadPriority): T {
  const previous = priority;
  priority = requested;
  try {
    return operation();
  } finally {
    priority = previous;
  }
}
export function preload<T>(operation: () => Promise<T>, requested: ReadPriority = 'speculative'): Promise<T | undefined> {
  return withReadPriority(operation, requested).catch(() => undefined);
}
export const currentReadPriority = () => priority;

/** Write guards must inspect live repository state even when an overview is fresh. */
export function freshRead<T>(operation: () => Promise<T>): Promise<T> {
  const previous = requireFreshRead;
  requireFreshRead = true;
  try {
    return operation();
  } finally {
    requireFreshRead = previous;
  }
}

export function invalidateResources(domain: ResourceDomain, scope?: string, operations?: readonly string[], affects?: (key: readonly unknown[]) => boolean) {
  queueMicrotask(refreshVisibleResources);
  const predicate = (q: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }) =>
    !q.meta?.immutable &&
    q.queryKey[1] === domain &&
    (!scope || q.queryKey[2] === scope) &&
    (!operations || operations.includes(String(q.queryKey[3]))) &&
    (!affects || affects(q.queryKey));
  void queryClient.cancelQueries({ predicate });
  void queryClient.invalidateQueries({ predicate, refetchType: 'none' });
  if (domain === 'git' && !operations && (!affects || affects(['resource', 'git', scope, 'getCommitLogPage']))) {
    const release = (q: { queryKey: readonly unknown[] }) =>
      q.queryKey[1] === 'github' && q.queryKey[3] === 'getReleaseContext' && (!scope || (q.queryKey[4] as { repoPath?: string })?.repoPath === scope);
    void queryClient.cancelQueries({ predicate: release });
    void queryClient.invalidateQueries({ predicate: release, refetchType: 'none' });
  }
}

function plannerWrite(name: string, args: unknown[], result: unknown) {
  const response = result as { data?: PlannerProject | PlannerItem | { project: PlannerProject } };
  const key = resourceKey('planner', 'getData');
  updateResource<{ success: true; data: ProjectPlannerData }>(key, (old) => {
    if (!old?.data || !Array.isArray(old.data.projects) || !Array.isArray(old.data.items)) return old;
    let { projects, items } = old.data;
    const data = response.data;
    if (name === 'deleteItem') items = items.filter((item) => item.id !== args[0]);
    else if (name === 'deleteProject' || name === 'deleteRepositoryProjectByPath') {
      projects = projects.filter((p) =>
        name === 'deleteProject' ? p.id !== args[0] : !p.repoPath || normalizeRepoPathKey(p.repoPath) !== normalizeRepoPathKey(String(args[0])),
      );
      items = items.filter((item) => projects.some((p) => p.id === item.projectId));
    } else if (data && typeof data === 'object') {
      if ('projectId' in data) items = [...items.filter((item) => item.id !== data.id), data];
      else {
        const project = 'project' in data ? data.project : data;
        if ('id' in project) projects = [...projects.filter((p) => p.id !== project.id), project];
      }
    }
    return { success: true, data: { ...old.data, projects, items } };
  });
}

export function cachedClient<T extends object>(domain: ResourceDomain, client: T): T {
  const methods = client as Record<string, unknown>;
  for (const property of Object.keys(methods)) {
    const original = methods[property];
    if (typeof original !== 'function') continue;
    const wrapped = (...args: unknown[]) => {
      const policy = readPolicies[domain][property];
      const commandIndex = property === 'runGitCommandForRepo' ? 1 : 0;
      const commandCall = domain === 'git' && ['runGitCommand', 'runGitCommandForRepo'].includes(property);
      const readCommand = commandCall && isReadCommand(args[commandIndex], args.slice(commandIndex + 1));
      if (policy || readCommand) {
        const key = resourceKey(domain, property, args);
        const requestedPriority = priority;
        const force = requireFreshRead;
        if (force) void queryClient.cancelQueries({ queryKey: key, exact: true });
        const branchPages = domain === 'github' && property === 'getBranches' && supportsBranchPages();
        return readResource(
          key,
          (signal) =>
            branchPages
              ? readGithubBranches(key, String(args[0]), String(args[1]), signal, requestedPriority)
              : property === 'getCommitLogPage'
                ? cancellableRead(signal, requestedPriority, (request) =>
                    original.apply(client, request ? [{ ...(args[0] as object), readRequest: request }] : args),
                  )
                : original.apply(client, args),
          {
            staleTime: domain === 'git' && isImmutableGitRead(property, args) ? Infinity : (policy?.staleTime ?? 15_000),
            priority,
            force,
            scheduled: !branchPages,
          },
        );
      }
      const selection = ['setRepoPath', 'clearRepoPath'].includes(property) ? ++repositorySelection : repositorySelection;
      const result = original.apply(client, args);
      if (!isMutation(domain, property) && !commandCall && !['setRepoPath', 'clearRepoPath'].includes(property)) return result;
      const scope = domain === 'github' ? githubScope : domain === 'git' ? gitMutationScope(property, args, activeRepository) : activeRepository;
      return Promise.resolve(result).then((value: unknown) => {
        // Even a failed merge may have changed the index and working tree.
        if (domain === 'git') invalidateResources(domain, scope, undefined, (key) => gitMutationAffects(property, args, key));
        if (value === false || (value && typeof value === 'object' && 'success' in value && !value.success)) return value;
        if (property === 'setRepoPath') {
          if (selection === repositorySelection) setActiveResourceRepository(typeof value === 'string' ? value : String(args[0]));
        } else if (property === 'clearRepoPath') {
          if (selection === repositorySelection) setActiveResourceRepository(null);
        } else if (domain === 'planner') {
          invalidateResources('planner');
          plannerWrite(property, args, value);
        } else if (domain === 'app') {
          const method = property === 'setStoredRepos' ? 'getStoredRepos' : 'getSettings';
          updateResource(resourceKey('app', method), property === 'setStoredRepos' ? args[0] : value);
        } else if (domain === 'github') invalidateResources(domain, scope, undefined, (key) => githubMutationAffects(property, args, key));
        else if (domain === 'runs') {
          if (property === 'saveConfig') updateResource(resourceKey('runs', 'getConfig', [args[0]]), value);
          else if (property === 'start') updateResource(resourceKey('runs', 'getState'), value);
          else invalidateResources('runs', 'application', ['getState']);
        }
        return value;
      });
    };
    methods[property] = wrapped;
  }
  return client;
}
