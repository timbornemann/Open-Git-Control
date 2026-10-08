import type { StoredRepoData } from '../../../types/appDtos';
import type { IpcResult } from '../../../types/ipc';
import type { RepositoryLocationRequest } from '../repositoryLocation';
import type { RepositoryIconCacheRequestDto, RepositoryIconChoiceDto, RepositoryIconSourceDto, RepositoryIconStateDto } from '../../repositoryIcons';

export interface ElectronReposAPI {
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  resolveRepoPath: (repoPath: string) => Promise<string>;
  setRepoPath: (repoPath: string) => Promise<string>;
  clearRepoPath: () => Promise<boolean>;
  recheckRepository: (request: RepositoryLocationRequest) => Promise<IpcResult<string>>;
  selectRepositoryLocation: (request: RepositoryLocationRequest) => Promise<IpcResult<string | null>>;
  getRepositoryIcon: (repoPath: string, rescan?: boolean) => Promise<IpcResult<RepositoryIconStateDto>>;
  readRepositoryIconSource: (repoPath: string, relativePath: string) => Promise<IpcResult<RepositoryIconSourceDto>>;
  saveRepositoryIconChoice: (repoPath: string, choice: RepositoryIconChoiceDto) => Promise<IpcResult<RepositoryIconStateDto>>;
  cacheRepositoryIconThumbnail: (repoPath: string, request: RepositoryIconCacheRequestDto) => Promise<IpcResult<RepositoryIconStateDto>>;
  selectRepositoryIconFile: (repoPath: string) => Promise<IpcResult<string | null>>;
  onRepositoryIconChanged: (callback: (state: RepositoryIconStateDto) => void) => () => void;
}
