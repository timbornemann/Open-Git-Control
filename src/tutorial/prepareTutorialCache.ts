import { queryClient } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { DEMO_REPO, DEMO_SECOND_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO, ok, type DemoRepository } from './demoRepository';

/** Menu contents must not depend on speculative preloads or window visibility. */
export function prepareTutorialCache(repo: DemoRepository) {
  if (!window.tutorialHost || window.electronAPI) throw new Error('An isolated tutorial renderer is required.');
  for (const path of [DEMO_REPO, DEMO_SECOND_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO]) {
    if (repo.hasProject(path)) queryClient.setQueryData(resourceKey('git', 'getRepoOriginUrl', [path]), ok(repo.originFor(path)));
  }
}
