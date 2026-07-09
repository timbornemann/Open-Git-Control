import type {
  ElectronAPI,
  ElectronAiAPI,
  ElectronAppAPI,
  ElectronGitAPI,
  ElectronGithubAPI,
  ElectronPlannerAPI,
  ElectronReposAPI,
  ElectronSettingsAPI,
} from '@/global';

export const getElectronApi = (): ElectronAPI | null => {
  if (typeof window === 'undefined') return null;
  return window.electronAPI ?? null;
};

export const requireElectronApi = (): ElectronAPI => {
  const api = getElectronApi();
  if (!api) {
    throw new Error('Electron API is not available.');
  }
  return api;
};

export const requireElectronGitApi = (): ElectronGitAPI => {
  const api = requireElectronApi();
  return api.git ?? (api as unknown as ElectronGitAPI);
};

export const requireElectronGithubApi = (): ElectronGithubAPI => {
  const api = requireElectronApi();
  return api.github ?? (api as unknown as ElectronGithubAPI);
};

export const requireElectronPlannerApi = (): ElectronPlannerAPI => {
  const api = requireElectronApi();
  return api.planner ?? (api as unknown as ElectronPlannerAPI);
};

export const requireElectronSettingsApi = (): ElectronSettingsAPI => {
  const api = requireElectronApi();
  return api.settings ?? (api as unknown as ElectronSettingsAPI);
};

export const requireElectronAppApi = (): ElectronAppAPI => {
  const api = requireElectronApi();
  return api.app ?? (api as unknown as ElectronAppAPI);
};

export const requireElectronAiApi = (): ElectronAiAPI => {
  const api = requireElectronApi();
  return api.ai ?? (api as unknown as ElectronAiAPI);
};

export const requireElectronReposApi = (): ElectronReposAPI => {
  const api = requireElectronApi();
  return api.repos ?? (api as unknown as ElectronReposAPI);
};
