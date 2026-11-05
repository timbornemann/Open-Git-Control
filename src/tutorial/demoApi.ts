import type { ElectronAPI, ElectronFlatAPI } from '@/shared/ipc/contracts/electronApi';
import type { TutorialLaunchContext, TutorialStep } from '@/shared/tutorial/types';
import { DemoRepository, unavailable } from './demoRepository';
import { createDemoGitApi } from './demoGitApi';
import { createDemoSystemApi } from './demoSystemApi';
import { createDemoPlanningApi } from './demoPlanningApi';
import { createDemoHostingApi } from './demoHostingApi';
import { createDemoTransferApi } from './demoTransfers';
import { createDemoRunApi } from './demoRunApi';
import { createDemoBranchApi } from './demoBranchApi';
import { createDemoBranchCleanupApi } from './demoBranchCleanupApi';
import { createDemoRepositoryApi } from './demoRepositoryApi';
import { createDemoCommitMessageEditApi } from './demoCommitMessageEdit';
import { createDemoRebaseApi } from './demoRebaseApi';

/** One facade per checkpoint. Nothing ever falls through to a native API. */
export function createDemoApi(context: TutorialLaunchContext, step: TutorialStep) {
  const repo = new DemoRepository();
  repo.reset(step, context.language);
  const settingsContext = step.prepare?.commit?.signoff ? { ...context, practiceSignoff: true } : context;
  const catalog = createDemoRepositoryApi(repo, step);
  const methods: Partial<ElectronFlatAPI> = {
    ...createDemoGitApi(repo),
    ...createDemoCommitMessageEditApi(repo),
    ...createDemoRebaseApi(repo),
    ...createDemoSystemApi(repo, settingsContext, catalog.stored),
    ...createDemoPlanningApi(repo),
    ...createDemoHostingApi(repo),
    ...createDemoTransferApi(repo),
    ...createDemoRunApi(repo),
    ...createDemoBranchApi(repo),
    ...createDemoBranchCleanupApi(repo),
    ...catalog.methods,
  };
  const unsupported = new Set<string>();
  const namespaces = new Set(['git', 'app', 'repos', 'settings', 'planner', 'hosting', 'transfers', 'runs', 'ai']);
  const api: ElectronAPI = new Proxy(methods, {
    get(target, key: string) {
      if (namespaces.has(key)) return api;
      if (key === 'then') return undefined;
      if (key in target) return target[key as keyof ElectronFlatAPI];
      if (key.startsWith('on')) return () => () => undefined;
      return () => {
        unsupported.add(key);
        console.warn('Tutorial simulation has no handler for:', key);
        return Promise.resolve(unavailable());
      };
    },
  }) as ElectronAPI;
  return { api, repo, unsupported };
}
