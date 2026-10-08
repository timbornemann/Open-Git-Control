import type { IpcResult } from '../../../types/ipc';
import type {
  AddRepositorySecretScanAllowlistPathsDto,
  RepositorySecretScanAllowlistDto,
  SaveRepositorySecretScanAllowlistDto,
} from '../../../types/repositorySecretScanAllowlist';

export interface ElectronRepositorySecretScanAllowlistAPI {
  getRepositorySecretScanAllowlist: (repoPath: string) => Promise<IpcResult<RepositorySecretScanAllowlistDto>>;
  saveRepositorySecretScanAllowlist: (request: SaveRepositorySecretScanAllowlistDto) => Promise<IpcResult<RepositorySecretScanAllowlistDto>>;
  addRepositorySecretScanAllowlistPaths: (request: AddRepositorySecretScanAllowlistPathsDto) => Promise<IpcResult<RepositorySecretScanAllowlistDto>>;
  watchRepositorySecretScanAllowlist: (repoPath: string | null) => Promise<IpcResult<boolean>>;
  onRepositorySecretScanAllowlistChanged: (callback: (repoPath: string) => void) => () => void;
}
