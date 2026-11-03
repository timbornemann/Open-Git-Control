import type { ElectronRemoteTransferAPI } from '@/shared/ipc/contracts/remoteTransfers';
import type { RemoteTransferOperation, RemoteTransferOperations, RemotePreferences, GitPushPlanDto } from '@/types/remoteTransfers';
import { DEMO_URL, ok, unavailable, type DemoRepository } from './demoRepository';

export function createDemoTransferApi(repo: DemoRepository): ElectronRemoteTransferAPI {
  let preferences: RemotePreferences = {
    fetchRemote: 'origin',
    pullRemote: 'origin',
    pushRemotes: ['origin'],
    selectionModes: { fetch: 'remember', pull: 'remember', push: 'remember' },
  };
  let plan: GitPushPlanDto | undefined;
  const remotes = () => ({
    repoPath: repo.activeRepo,
    branch: repo.branch,
    upstream: { remote: 'origin', branch: repo.branch },
    defaultPushRemote: 'origin',
    remotes: [{ name: 'origin', fetchUrls: [DEMO_URL], pushUrls: [DEMO_URL] }],
    supportsPushUrlIsolation: true,
  });
  const handlers: { [K in RemoteTransferOperation]?: (input: RemoteTransferOperations[K]['input']) => RemoteTransferOperations[K]['output'] } = {
    getRemotes: remotes,
    getPreferences: () => preferences,
    setPreferences: (input) => {
      preferences = input.preferences;
      return preferences;
    },
    getPullConfiguration: () => ({ branch: repo.branch, rebase: null, fastForward: null, mergeOptions: null }),
    getPullRecovery: () => ({ branchExists: true, defaultBranch: { name: 'main', localExists: true } }),
    editRemote: remotes,
    checkConnection: () => true,
    setUpstream: () => true,
    cancel: () => true,
    fetch: (input) => {
      if (!input.background) repo.mark('fetched');
      return { output: 'Already up to date.', refsChanged: false };
    },
    pull: () => {
      repo.mark('pulled');
      return { output: 'Already up to date.' };
    },
    planPush: (input) => {
      plan = {
        id: 'tutorial-push',
        secretScanArgs: [],
        repoPath: repo.activeRepo,
        sourceOid: repo.commits[0].hash,
        branch: repo.branch,
        tagNames: input.tagNames || [],
        force: false,
        targets: [{ id: 'origin', remoteName: 'origin', url: DEMO_URL, destinationRef: `refs/heads/${repo.branch}`, sourceOid: repo.commits[0].hash }],
      };
      return plan;
    },
    executePush: () => {
      repo.mark('pushed');
      return {
        id: 'demo-batch',
        planId: plan?.id || 'tutorial-push',
        repoPath: repo.activeRepo,
        sourceOid: repo.commits[0].hash,
        state: 'success',
        targets: (plan?.targets || []).map((target) => ({ ...target, status: 'success', message: 'Published in the exercise.' })),
      };
    },
  };
  return {
    remoteTransferRequest: async <K extends RemoteTransferOperation>(operation: K, input: RemoteTransferOperations[K]['input']) => {
      const handler = handlers[operation];
      return handler ? ok(handler(input)) : unavailable();
    },
  };
}
