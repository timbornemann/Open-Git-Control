import { beforeEach, afterEach } from 'vitest';
import { queryClient } from './queryClient';
import { setActiveResourceRepository, setGithubResourceScope } from './clientCache';
import { backgroundQueue } from './backgroundQueue';

beforeEach(() => {
  queryClient.clear();
  setActiveResourceRepository(null);
  setGithubResourceScope('github.com', null);
  backgroundQueue.setPaused(false);
});
afterEach(() => {
  queryClient.clear();
});
