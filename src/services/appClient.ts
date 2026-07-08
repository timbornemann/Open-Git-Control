import type { ElectronAPI } from '../global';
import { getElectronApi, requireElectronApi } from './electronApi';

export const appClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async openDirectory(...args: Parameters<ElectronAPI['openDirectory']>): ReturnType<ElectronAPI['openDirectory']> {
    return requireElectronApi().openDirectory(...args);
  },

  async selectDirectory(...args: Parameters<ElectronAPI['selectDirectory']>): ReturnType<ElectronAPI['selectDirectory']> {
    return requireElectronApi().selectDirectory(...args);
  },

  async selectProjectParentDirectory(...args: Parameters<ElectronAPI['selectProjectParentDirectory']>): ReturnType<ElectronAPI['selectProjectParentDirectory']> {
    return requireElectronApi().selectProjectParentDirectory(...args);
  },

  async openExternalUrl(...args: Parameters<ElectronAPI['openExternalUrl']>): ReturnType<ElectronAPI['openExternalUrl']> {
    return requireElectronApi().openExternalUrl(...args);
  },

  async getSettings(...args: Parameters<ElectronAPI['getSettings']>): ReturnType<ElectronAPI['getSettings']> {
    return requireElectronApi().getSettings(...args);
  },

  async setSettings(...args: Parameters<ElectronAPI['setSettings']>): ReturnType<ElectronAPI['setSettings']> {
    return requireElectronApi().setSettings(...args);
  },

  async setGeminiApiKey(...args: Parameters<ElectronAPI['setGeminiApiKey']>): ReturnType<ElectronAPI['setGeminiApiKey']> {
    return requireElectronApi().setGeminiApiKey(...args);
  },

  async clearGeminiApiKey(...args: Parameters<ElectronAPI['clearGeminiApiKey']>): ReturnType<ElectronAPI['clearGeminiApiKey']> {
    return requireElectronApi().clearGeminiApiKey(...args);
  },

  async getPlanningApiInfo(...args: Parameters<ElectronAPI['getPlanningApiInfo']>): ReturnType<ElectronAPI['getPlanningApiInfo']> {
    return requireElectronApi().getPlanningApiInfo(...args);
  },

  async generatePlanningApiToken(...args: Parameters<ElectronAPI['generatePlanningApiToken']>): ReturnType<ElectronAPI['generatePlanningApiToken']> {
    return requireElectronApi().generatePlanningApiToken(...args);
  },

  async clearPlanningApiToken(...args: Parameters<ElectronAPI['clearPlanningApiToken']>): ReturnType<ElectronAPI['clearPlanningApiToken']> {
    return requireElectronApi().clearPlanningApiToken(...args);
  },

  async getAppVersion(...args: Parameters<ElectronAPI['getAppVersion']>): ReturnType<ElectronAPI['getAppVersion']> {
    return requireElectronApi().getAppVersion(...args);
  },

  async getUpdaterStatus(...args: Parameters<ElectronAPI['getUpdaterStatus']>): ReturnType<ElectronAPI['getUpdaterStatus']> {
    return requireElectronApi().getUpdaterStatus(...args);
  },

  async runOneClickAppUpdate(...args: Parameters<ElectronAPI['runOneClickAppUpdate']>): ReturnType<ElectronAPI['runOneClickAppUpdate']> {
    return requireElectronApi().runOneClickAppUpdate(...args);
  },

  async installAppUpdate(...args: Parameters<ElectronAPI['installAppUpdate']>): ReturnType<ElectronAPI['installAppUpdate']> {
    return requireElectronApi().installAppUpdate(...args);
  },

  onUpdaterEvent(...args: Parameters<ElectronAPI['onUpdaterEvent']>): ReturnType<ElectronAPI['onUpdaterEvent']> {
    return requireElectronApi().onUpdaterEvent(...args);
  },

  async getStoredRepos(...args: Parameters<ElectronAPI['getStoredRepos']>): ReturnType<ElectronAPI['getStoredRepos']> {
    return requireElectronApi().getStoredRepos(...args);
  },

  async setStoredRepos(...args: Parameters<ElectronAPI['setStoredRepos']>): ReturnType<ElectronAPI['setStoredRepos']> {
    return requireElectronApi().setStoredRepos(...args);
  },

  async setRepoPath(...args: Parameters<ElectronAPI['setRepoPath']>): ReturnType<ElectronAPI['setRepoPath']> {
    return requireElectronApi().setRepoPath(...args);
  },

  async clearRepoPath(...args: Parameters<ElectronAPI['clearRepoPath']>): ReturnType<ElectronAPI['clearRepoPath']> {
    return requireElectronApi().clearRepoPath(...args);
  },

  async getDiagnosticsReport(...args: Parameters<ElectronAPI['getDiagnosticsReport']>): ReturnType<ElectronAPI['getDiagnosticsReport']> {
    return requireElectronApi().getDiagnosticsReport(...args);
  },
};
