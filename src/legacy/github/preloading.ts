import { githubClient } from './githubClient';
import { preload } from '@/data/clientCache';

export function preloadGithubRepository(owner: string, repo: string) {
  void preload(() => githubClient.getRepository(owner, repo), 'repository');
  void preload(() => githubClient.getPullRequests(owner, repo, 'open'));
  void preload(() => githubClient.getWorkflowRunsPage({ owner, repo, page: 1, perPage: 20 }));
  void preload(() => githubClient.getBranches(owner, repo));
}
