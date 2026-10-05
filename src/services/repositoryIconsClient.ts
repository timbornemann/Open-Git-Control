import { getElectronApi } from './electronApi';
import type { RepositoryIconCacheRequestDto, RepositoryIconChoiceDto } from '@/shared/repositoryIcons';
const api = () => {
  const repos = getElectronApi()?.repos;
  if (!repos?.getRepositoryIcon) throw new Error('Repository logo API is unavailable.');
  return repos;
};
export const repositoryIconsClient = {
  isAvailable: () => Boolean(getElectronApi()?.repos?.getRepositoryIcon),
  get: (repo: string, rescan = false) => api().getRepositoryIcon(repo, rescan),
  readSource: (repo: string, file: string) => api().readRepositoryIconSource(repo, file),
  choose: (repo: string, choice: RepositoryIconChoiceDto) => api().saveRepositoryIconChoice(repo, choice),
  cache: (repo: string, request: RepositoryIconCacheRequestDto) => api().cacheRepositoryIconThumbnail(repo, request),
  selectFile: (repo: string) => api().selectRepositoryIconFile(repo),
  subscribe: (callback: Parameters<ReturnType<typeof api>['onRepositoryIconChanged']>[0]) => api().onRepositoryIconChanged(callback),
};
