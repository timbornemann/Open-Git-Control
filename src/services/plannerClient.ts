import type { ElectronAPI } from '../global';
import { getElectronApi, requireElectronApi } from './electronApi';

export const plannerClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async getData(...args: Parameters<ElectronAPI['plannerGetData']>): ReturnType<ElectronAPI['plannerGetData']> {
    return requireElectronApi().plannerGetData(...args);
  },

  async ensureRepositoryProject(...args: Parameters<ElectronAPI['plannerEnsureRepositoryProject']>): ReturnType<ElectronAPI['plannerEnsureRepositoryProject']> {
    return requireElectronApi().plannerEnsureRepositoryProject(...args);
  },

  async createProject(...args: Parameters<ElectronAPI['plannerCreateProject']>): ReturnType<ElectronAPI['plannerCreateProject']> {
    return requireElectronApi().plannerCreateProject(...args);
  },

  async updateProject(...args: Parameters<ElectronAPI['plannerUpdateProject']>): ReturnType<ElectronAPI['plannerUpdateProject']> {
    return requireElectronApi().plannerUpdateProject(...args);
  },

  async deleteProject(...args: Parameters<ElectronAPI['plannerDeleteProject']>): ReturnType<ElectronAPI['plannerDeleteProject']> {
    return requireElectronApi().plannerDeleteProject(...args);
  },

  async deleteRepositoryProjectByPath(...args: Parameters<ElectronAPI['plannerDeleteRepositoryProjectByPath']>): ReturnType<ElectronAPI['plannerDeleteRepositoryProjectByPath']> {
    return requireElectronApi().plannerDeleteRepositoryProjectByPath(...args);
  },

  async createItem(...args: Parameters<ElectronAPI['plannerCreateItem']>): ReturnType<ElectronAPI['plannerCreateItem']> {
    return requireElectronApi().plannerCreateItem(...args);
  },

  async updateItem(...args: Parameters<ElectronAPI['plannerUpdateItem']>): ReturnType<ElectronAPI['plannerUpdateItem']> {
    return requireElectronApi().plannerUpdateItem(...args);
  },

  async deleteItem(...args: Parameters<ElectronAPI['plannerDeleteItem']>): ReturnType<ElectronAPI['plannerDeleteItem']> {
    return requireElectronApi().plannerDeleteItem(...args);
  },

  async materializeProject(...args: Parameters<ElectronAPI['plannerMaterializeProject']>): ReturnType<ElectronAPI['plannerMaterializeProject']> {
    return requireElectronApi().plannerMaterializeProject(...args);
  },
};
