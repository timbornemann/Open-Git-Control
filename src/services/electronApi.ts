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
  return requireElectronApi().git;
};

export const requireElectronGithubApi = (): ElectronGithubAPI => {
  return requireElectronApi().github;
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
