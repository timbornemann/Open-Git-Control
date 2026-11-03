import type {
  ElectronAPI,
  ElectronAiAPI,
  ElectronAppAPI,
  ElectronGitAPI,
  ElectronPlannerAPI,
  ElectronReposAPI,
  ElectronSettingsAPI,
} from '@/shared/ipc/contracts/electronApi';

let isolatedProvider: ElectronAPI | undefined;
/** Set only by the standalone tutorial entry, before mounting the application. */
export function setIsolatedElectronApi(api: ElectronAPI): void {
  if (typeof window !== 'undefined' && window.electronAPI) throw new Error('Cannot replace the native application bridge.');
  isolatedProvider = api;
}

export const getElectronApi = (): ElectronAPI | null => {
  if (typeof window === 'undefined') return null;
  return isolatedProvider ?? window.electronAPI ?? null;
};

export const requireElectronApi = (): ElectronAPI => {
  const api = getElectronApi();
  if (!api) {
    throw new Error('Electron API is not available.');
  }
  return api;
};

export const requireElectronGitApi = (): ElectronGitAPI => {
  return requireElectronApi().git;
};

export const requireElectronPlannerApi = (): ElectronPlannerAPI => {
  return requireElectronApi().planner;
};

export const requireElectronSettingsApi = (): ElectronSettingsAPI => {
  return requireElectronApi().settings;
};

export const requireElectronAppApi = (): ElectronAppAPI => {
  return requireElectronApi().app;
};

export const requireElectronAiApi = (): ElectronAiAPI => {
  return requireElectronApi().ai;
};

export const requireElectronReposApi = (): ElectronReposAPI => {
  return requireElectronApi().repos;
};
