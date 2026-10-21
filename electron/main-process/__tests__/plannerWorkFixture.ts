import * as fs from 'node:fs';
import * as path from 'node:path';
import { vi } from 'vitest';
import { fixture, git } from '../../git/__tests__/remoteTransferFixture';
import type { GitIntegrationLifecycle } from '../../git/__tests__/gitIntegrationLifecycle';
import { PlannerWorkCache } from '../PlannerWorkCache';
import { PlannerWorkService, type PlannerWorkContext } from '../PlannerWorkService';
import type { PlannerHostingResult } from '../PlannerWorkHosting';
import { workPlanningPath, loadWorkItem } from '../PlannerWorkStore';
import { writeRepositoryPlanningFile } from '../repositoryPlanningFile';
import type { PlannerWorkChangeRequest } from '../../../src/types/plannerWork';

export function workFixture(lifecycle: GitIntegrationLifecycle) {
  const f = fixture(lifecycle);
  const project = { id: 'project-1', name: 'Example', kind: 'repository' as const, repoPath: f.repo, description: '', createdAt: 1, updatedAt: 1 };
  const item = {
    id: 'task-1',
    projectId: project.id,
    title: 'Änderung mit Prüfung',
    description: 'Acceptance criteria',
    priority: 'medium' as const,
    status: 'planned' as const,
    tags: ['Feature'],
    createdAt: 1,
    updatedAt: 1,
  };
  fs.mkdirSync(path.dirname(workPlanningPath(f.repo)), { recursive: true });
  writeRepositoryPlanningFile(workPlanningPath(f.repo), { version: 1, projects: [project], items: [item] });
  git(f.repo, 'add', '.Open-Git-Control/planning.json');
  git(f.repo, 'commit', '-m', 'planning');
  const cache = new PlannerWorkCache(path.join(f.root, 'local-cache'));
  const remote: PlannerHostingResult = { checkedAt: Date.now(), requests: [] };
  const state = { account: 'account-1' };
  const hosting = { version: () => state.account, read: vi.fn(async () => remote) };
  const service = new PlannerWorkService(lifecycle.runner, cache, hosting);
  const context: PlannerWorkContext = { ownerId: 1, signal: lifecycle.signal, ensureActive: () => lifecycle.signal.throwIfAborted(), progress: vi.fn() };
  const request = { repoPath: f.repo, itemId: item.id };
  const current = () => loadWorkItem(f.repo, item.id);
  const inspect = () => service.inspect(request, context);
  const start = async (acceptChanges = false, branchName?: string) => {
    const plan = await inspect();
    return service.start({ ...request, planId: plan.planId, branchName: branchName || plan.suggestedName, baseRef: plan.defaultBase, acceptChanges }, context);
  };
  const commitPlanning = () => {
    git(f.repo, 'add', '.Open-Git-Control/planning.json');
    git(f.repo, 'commit', '-m', 'record workflow');
  };
  const pr = (headSha: string, overrides: Partial<PlannerWorkChangeRequest> = {}): PlannerWorkChangeRequest => ({
    workflowId: current().item.references!.activeWorkflowId!,
    provider: 'github',
    server: 'https://code.invalid',
    repositoryId: '42',
    fullPath: 'team/repo',
    id: '1',
    number: '1',
    url: 'https://code.invalid/team/repo/pull/1',
    title: 'Work request',
    state: 'open',
    sourceBranch: git(f.repo, 'branch', '--show-current'),
    targetBranch: 'main',
    headSha,
    createdAt: Date.now(),
    ...overrides,
  });
  return { ...f, cache, hosting, remote, state, service, context, request, current, inspect, start, commitPlanning, pr };
}
