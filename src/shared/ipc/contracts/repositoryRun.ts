import type { IpcResult } from '../../../types/ipc';
import type {
  RepositoryRunActionId,
  RepositoryRunConfigDto,
  RepositoryRunConfigStateDto,
  RepositoryRunEventDto,
  RepositoryRunStateDto,
} from '../../../types/repositoryRun';

export interface ElectronRepositoryRunAPI {
  getRepositoryRunConfig: (repoPath: string) => Promise<IpcResult<RepositoryRunConfigStateDto>>;
  saveRepositoryRunConfig: (repoPath: string, config: RepositoryRunConfigDto) => Promise<IpcResult<RepositoryRunConfigDto>>;
  startRepositoryRun: (repoPath: string, action: RepositoryRunActionId) => Promise<IpcResult<RepositoryRunStateDto>>;
  stopRepositoryRun: (runId?: string) => Promise<IpcResult<boolean>>;
  getRepositoryRunState: () => Promise<IpcResult<RepositoryRunStateDto | null>>;
  onRepositoryRunEvent: (callback: (event: RepositoryRunEventDto) => void) => () => void;
}
