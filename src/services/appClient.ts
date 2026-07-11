import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { getElectronApi, requireElectronAppApi, requireElectronReposApi, requireElectronSettingsApi } from './electronApi';

export const appClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async openDirectory(...args: Parameters<ElectronAPI['openDirectory']>): ReturnType<ElectronAPI['openDirectory']> {
    return requireElectronAppApi().openDirectory(...args);
  },

  async selectDirectory(...args: Parameters<ElectronAPI['selectDirectory']>): ReturnType<ElectronAPI['selectDirectory']> {
    return requireElectronAppApi().selectDirectory(...args);
  },

  async selectFiles(...args: Parameters<ElectronAPI['selectFiles']>): ReturnType<ElectronAPI['selectFiles']> {
    return requireElectronAppApi().selectFiles(...args);
  },

  async selectProjectParentDirectory(
    ...args: Parameters<ElectronAPI['selectProjectParentDirectory']>
  ): ReturnType<ElectronAPI['selectProjectParentDirectory']> {
    return requireElectronAppApi().selectProjectParentDirectory(...args);
  },

  async openExternalUrl(...args: Parameters<ElectronAPI['openExternalUrl']>): ReturnType<ElectronAPI['openExternalUrl']> {
    return requireElectronAppApi().openExternalUrl(...args);
  },

  async getSettings(...args: Parameters<ElectronAPI['getSettings']>): ReturnType<ElectronAPI['getSettings']> {
    return requireElectronSettingsApi().getSettings(...args);
  },

  async setSettings(...args: Parameters<ElectronAPI['setSettings']>): ReturnType<ElectronAPI['setSettings']> {
    return requireElectronSettingsApi().setSettings(...args);
  },

  async setGeminiApiKey(...args: Parameters<ElectronAPI['setGeminiApiKey']>): ReturnType<ElectronAPI['setGeminiApiKey']> {
    return requireElectronSettingsApi().setGeminiApiKey(...args);
  },

  async clearGeminiApiKey(...args: Parameters<ElectronAPI['clearGeminiApiKey']>): ReturnType<ElectronAPI['clearGeminiApiKey']> {
    return requireElectronSettingsApi().clearGeminiApiKey(...args);
  },

  async setOpenAiApiKey(...args: Parameters<ElectronAPI['setOpenAiApiKey']>): ReturnType<ElectronAPI['setOpenAiApiKey']> {
    return requireElectronSettingsApi().setOpenAiApiKey(...args);
  },

  async clearOpenAiApiKey(...args: Parameters<ElectronAPI['clearOpenAiApiKey']>): ReturnType<ElectronAPI['clearOpenAiApiKey']> {
    return requireElectronSettingsApi().clearOpenAiApiKey(...args);
  },

  async getPlanningApiInfo(...args: Parameters<ElectronAPI['getPlanningApiInfo']>): ReturnType<ElectronAPI['getPlanningApiInfo']> {
    return requireElectronAppApi().getPlanningApiInfo(...args);
  },

  async generatePlanningApiToken(...args: Parameters<ElectronAPI['generatePlanningApiToken']>): ReturnType<ElectronAPI['generatePlanningApiToken']> {
    return requireElectronAppApi().generatePlanningApiToken(...args);
  },

  async clearPlanningApiToken(...args: Parameters<ElectronAPI['clearPlanningApiToken']>): ReturnType<ElectronAPI['clearPlanningApiToken']> {
    return requireElectronAppApi().clearPlanningApiToken(...args);
  },

  async getAppVersion(...args: Parameters<ElectronAPI['getAppVersion']>): ReturnType<ElectronAPI['getAppVersion']> {
    return requireElectronAppApi().getAppVersion(...args);
  },

  async getUpdaterStatus(...args: Parameters<ElectronAPI['getUpdaterStatus']>): ReturnType<ElectronAPI['getUpdaterStatus']> {
    return requireElectronAppApi().getUpdaterStatus(...args);
  },

  async runOneClickAppUpdate(...args: Parameters<ElectronAPI['runOneClickAppUpdate']>): ReturnType<ElectronAPI['runOneClickAppUpdate']> {
    return requireElectronAppApi().runOneClickAppUpdate(...args);
  },

  async installAppUpdate(...args: Parameters<ElectronAPI['installAppUpdate']>): ReturnType<ElectronAPI['installAppUpdate']> {
    return requireElectronAppApi().installAppUpdate(...args);
  },

  onUpdaterEvent(...args: Parameters<ElectronAPI['onUpdaterEvent']>): ReturnType<ElectronAPI['onUpdaterEvent']> {
    return requireElectronAppApi().onUpdaterEvent(...args);
  },

  async getStoredRepos(...args: Parameters<ElectronAPI['getStoredRepos']>): ReturnType<ElectronAPI['getStoredRepos']> {
    return requireElectronReposApi().getStoredRepos(...args);
  },

  async setStoredRepos(...args: Parameters<ElectronAPI['setStoredRepos']>): ReturnType<ElectronAPI['setStoredRepos']> {
    return requireElectronReposApi().setStoredRepos(...args);
  },

  async resolveRepoPath(...args: Parameters<ElectronAPI['resolveRepoPath']>): ReturnType<ElectronAPI['resolveRepoPath']> {
    return requireElectronReposApi().resolveRepoPath(...args);
  },

  async setRepoPath(...args: Parameters<ElectronAPI['setRepoPath']>): ReturnType<ElectronAPI['setRepoPath']> {
    return requireElectronReposApi().setRepoPath(...args);
  },

  async clearRepoPath(...args: Parameters<ElectronAPI['clearRepoPath']>): ReturnType<ElectronAPI['clearRepoPath']> {
    return requireElectronReposApi().clearRepoPath(...args);
  },

  async getDiagnosticsReport(...args: Parameters<ElectronAPI['getDiagnosticsReport']>): ReturnType<ElectronAPI['getDiagnosticsReport']> {
    return requireElectronAppApi().getDiagnosticsReport(...args);
  },
};
