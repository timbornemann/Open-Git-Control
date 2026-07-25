import type { RepositoryRunActionId, RepositoryRunConfigDto, RepositoryRunEventDto } from '@/types/repositoryRun';
import { getElectronApi, requireElectronApi } from './electronApi';

export const repositoryRunClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },
  getConfig(repoPath: string) {
    return requireElectronApi().runs.getRepositoryRunConfig(repoPath);
  },
  saveConfig(repoPath: string, config: RepositoryRunConfigDto) {
    return requireElectronApi().runs.saveRepositoryRunConfig(repoPath, config);
  },
  watchConfig(repoPath: string | null) {
    return requireElectronApi().runs.watchRepositoryRunConfig(repoPath);
  },
  start(repoPath: string, action: RepositoryRunActionId) {
    return requireElectronApi().runs.startRepositoryRun(repoPath, action);
  },
  stop(runId?: string) {
    return requireElectronApi().runs.stopRepositoryRun(runId);
  },
  getState() {
    return requireElectronApi().runs.getRepositoryRunState();
  },
  onConfigChanged(callback: (repoPath: string) => void) {
    return requireElectronApi().runs.onRepositoryRunConfigChanged(callback);
  },
  onEvent(callback: (event: RepositoryRunEventDto) => void) {
    return requireElectronApi().runs.onRepositoryRunEvent(callback);
  },
};
