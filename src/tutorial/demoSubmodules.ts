import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import type { TutorialStep } from '@/shared/tutorial/types';
import {
  SUBMODULE_PATH,
  SUBMODULE_RECORDED,
  SUBMODULE_OTHER,
  SUBMODULE_ORIGINAL_URL,
  SUBMODULE_NEW_URL,
  submoduleConfiguration,
} from '@/shared/tutorial/submoduleLessonExamples';
import { getDemoBlob, isDemoGitlink, demoBlobText } from './demoBlob';
import { refreshDemoFiles } from './demoFiles';
import { ok, unavailable, type DemoRepository } from './demoRepository';

/** Child repository configuration is separate from the parent's Git tree. */
export type DemoSubmodule = { initialized: boolean; configuredUrl: string | null; originUrl: string | null };
export function seedDemoSubmodules(repo: DemoRepository, scenario: NonNullable<TutorialStep['prepare']>['submodules']) {
  repo.submodules = new Map();
  if (!scenario) return;
  repo.files['.gitmodules'] = submoduleConfiguration(scenario === 'changed-url' ? SUBMODULE_NEW_URL : SUBMODULE_ORIGINAL_URL);
  repo.files[SUBMODULE_PATH] = { gitlink: SUBMODULE_RECORDED };
  const initialUrl = scenario === 'uninitialized' ? null : SUBMODULE_ORIGINAL_URL;
  repo.submodules.set(SUBMODULE_PATH, { initialized: scenario !== 'uninitialized', configuredUrl: initialUrl, originUrl: initialUrl });
}
export function prepareDemoSubmodules(repo: DemoRepository, scenario: NonNullable<TutorialStep['prepare']>['submodules']) {
  if (scenario === 'different-commit') repo.files[SUBMODULE_PATH] = { gitlink: SUBMODULE_OTHER };
  if (scenario) refreshDemoFiles(repo);
}
export function demoSubmoduleStatus(repo: DemoRepository): string {
  return [...repo.submodules]
    .flatMap(([path, state]) => {
      const index = getDemoBlob(repo.indexFiles, path),
        work = getDemoBlob(repo.files, path);
      if (!isDemoGitlink(index)) return [];
      const commit = state.initialized && isDemoGitlink(work) ? work.gitlink : index.gitlink;
      const flag = !state.initialized ? '-' : commit === index.gitlink ? ' ' : '+';
      return [flag + commit + ' ' + path + (state.initialized ? ' (' + (commit === SUBMODULE_RECORDED ? 'v1.0.0' : 'v1.1.0') + ')' : '') + '\n'];
    })
    .join('');
}
export function demoSubmoduleCommand(repo: DemoRepository, update: boolean) {
  // Parse the bundled .gitmodules form; never resolve URLs or invoke native IO.
  const config = demoBlobText(repo.files['.gitmodules']) || '';
  const url = /^\s*url\s*=\s*(\S+)\s*$/m.exec(config)?.[1];
  if (repo.submodules.size && ![SUBMODULE_ORIGINAL_URL, SUBMODULE_NEW_URL].some((known) => config === submoduleConfiguration(known))) return unavailable();
  const entries = [...repo.submodules].filter(([path]) => isDemoGitlink(getDemoBlob(repo.indexFiles, path)));
  if (
    entries.some(([path]) => {
      const target = getDemoBlob(repo.indexFiles, path);
      return !isDemoGitlink(target) || ![SUBMODULE_RECORDED, SUBMODULE_OTHER].includes(target.gitlink);
    })
  )
    return unavailable();
  for (const [path, state] of entries) {
    if (update) {
      if (!state.initialized) state.configuredUrl = state.originUrl = url!;
      state.initialized = true;
      repo.files[path] = structuredClone(repo.indexFiles[path]);
    } else if (state.initialized) state.configuredUrl = state.originUrl = url!;
  }
  const repeated = update && repo.events.has('submodules-updated');
  refreshDemoFiles(repo);
  repo.mark(update ? 'submodules-updated' : 'submodules-synced');
  if (repeated) repo.mark('submodules-update-repeated');
  repo.emitChannel('tree', repo.activeRepo);
  return ok(update ? 'Practice submodules initialized/updated.' : 'Practice submodule URLs synchronized.');
}
export function createDemoSubmoduleApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  return {
    openSubmodule: async (path, repoPath) => {
      if (repoPath !== repo.activeRepo || !repo.submodules.has(path)) return unavailable();
      repo.lastOpenedPath = repo.activeRepo + '/' + path;
      repo.mark('submodule-opened');
      return ok(true);
    },
  };
}
