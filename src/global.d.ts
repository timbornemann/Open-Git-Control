import type { ElectronAPI } from './shared/ipc/contracts/electronApi';

export type {
  ElectronAPI,
  ElectronAiAPI,
  ElectronApiNamespaceKey,
  ElectronAppAPI,
  ElectronFlatAPI,
  ElectronGitAPI,
  ElectronGithubAPI,
  ElectronPlannerAPI,
  ElectronReleaseNotesAPI,
  ElectronReposAPI,
  ElectronSettingsAPI,
} from './shared/ipc/contracts/electronApi';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    api: ElectronAPI;
  }
}

export {};
