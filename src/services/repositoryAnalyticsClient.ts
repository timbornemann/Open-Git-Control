import type { RepositoryAnalyticsApi } from '@/shared/ipc/repositoryAnalytics';
import { requireElectronGitApi } from './electronApi';

export const repositoryAnalyticsClient: RepositoryAnalyticsApi = {
  getRepositoryAnalyticsSnapshot: (request) => requireElectronGitApi().getRepositoryAnalyticsSnapshot(request),
  refreshRepositoryAnalytics: (request) => requireElectronGitApi().refreshRepositoryAnalytics(request),
  getRepositoryAnalyticsDetails: (request) => requireElectronGitApi().getRepositoryAnalyticsDetails(request),
  onRepositoryAnalyticsProgress: (callback) => requireElectronGitApi().onRepositoryAnalyticsProgress(callback),
};
