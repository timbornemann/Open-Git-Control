import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { BranchCleanupCandidate, BranchCleanupHostingMetadata, BranchCleanupInspection } from '../../../src/shared/ipc/branchCleanup';
import { BranchCleanupService } from '../BranchCleanupService';
import { BranchCleanupRemotes } from '../BranchCleanupRemotes';
import { BranchCleanupPreferencesStore } from '../BranchCleanupPreferences';
import { fixture, git } from './remoteTransferFixture';
import type { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import type { CleanupContext, CleanupEndpoint } from '../branchCleanupModel';

export function cleanupFixture(lifecycle: GitIntegrationLifecycle, withRemote = true) {
  const f = fixture(lifecycle);
  const server = f.bare('server');
  git(server, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  if (withRemote) {
    git(f.repo, 'remote', 'add', 'origin', server);
    git(f.repo, 'push', '-u', 'origin', 'main');
  }
  const state = {
    account: 'account-v1',
    complete: true,
    now: Date.now(),
    protected: new Set(['main']),
    openRequests: [] as BranchCleanupHostingMetadata['openRequests'],
    mergedRequests: [] as BranchCleanupHostingMetadata['mergedRequests'],
  };
  const metadata = vi.fn(async (endpoint: CleanupEndpoint): Promise<BranchCleanupHostingMetadata> => ({
    repository: { connectionId: 'test', repositoryId: '42', fullPath: 'team/repo' },
    defaultBranch: 'main',
    branches: git(endpoint.url, 'for-each-ref', '--format=%(refname:strip=2)%00%(objectname)', 'refs/heads/')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, oid] = line.split('\0');
        return { name, oid, protected: state.protected.has(name) };
      }),
    openRequests: state.openRequests,
    mergedRequests: state.mergedRequests,
    complete: state.complete,
  }));
  const preferences = new BranchCleanupPreferencesStore(() => path.join(f.root, 'cleanup-protection.json'));
  const remotes = new BranchCleanupRemotes({ git: lifecycle.runner, transfers: f.service, accountVersion: () => state.account, metadata });
  const service = new BranchCleanupService({ git: lifecycle.runner, remotes, preferences, now: () => state.now });
  const context: CleanupContext = {
    ownerId: 1,
    generation: 0,
    signal: lifecycle.signal,
    ensureActive: () => lifecycle.signal.throwIfAborted(),
    progress: vi.fn(),
  };
  const inspect = (targetOverrides?: Record<string, string>, ctx = context) =>
    service.inspect({ repoPath: f.repo, operationId: randomUUID(), targetOverrides }, ctx);
  const execute = (plan: BranchCleanupInspection, candidates: BranchCleanupCandidate[], confirmed: string[] = [], ctx = context) =>
    service.execute(
      {
        repoPath: f.repo,
        operationId: randomUUID(),
        planId: plan.id,
        selectedIds: candidates.map((candidate) => candidate.id),
        confirmedUnmergedIds: confirmed,
      },
      ctx,
    );
  const hasRef = (repo: string, ref: string) => Boolean(git(repo, 'for-each-ref', '--format=%(objectname)', ref));
  return { ...f, server, state, metadata, preferences, remotes, cleanup: service, context, inspect, execute, hasRef };
}
