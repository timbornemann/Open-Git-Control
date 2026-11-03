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

/** One facade per checkpoint. Nothing ever falls through to a native API. */
export function createDemoApi(context: TutorialLaunchContext, step: TutorialStep) {
  const repo = new DemoRepository();
  repo.reset(step);
  const methods: Partial<ElectronFlatAPI> = {
    ...createDemoGitApi(repo),
    ...createDemoSystemApi(repo, context),
    ...createDemoPlanningApi(repo),
    ...createDemoHostingApi(repo),
    ...createDemoTransferApi(repo),
    ...createDemoRunApi(repo),
    ...createDemoBranchApi(repo),
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
