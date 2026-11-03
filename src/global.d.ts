import type { ElectronAPI } from './shared/ipc/contracts/electronApi';
import type { TutorialHostApi } from './shared/tutorial/types';

export type {
  ElectronAPI,
  ElectronAiAPI,
  ElectronApiNamespaceKey,
  ElectronAppAPI,
  ElectronFlatAPI,
  ElectronGitAPI,
  ElectronPlannerAPI,
  ElectronReleaseNotesAPI,
  ElectronReposAPI,
  ElectronSettingsAPI,
} from './shared/ipc/contracts/electronApi';

declare global {
  interface Window {
    tutorialHost?: TutorialHostApi;
    electronAPI: ElectronAPI;
    api: ElectronAPI;
  }
}

export {};
