import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { getElectronApi, requireElectronPlannerApi } from './electronApi';

export const plannerClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async getData(...args: Parameters<ElectronAPI['plannerGetData']>): ReturnType<ElectronAPI['plannerGetData']> {
    return requireElectronPlannerApi().plannerGetData(...args);
  },

  onDataChanged(callback: () => void): () => void {
    return requireElectronPlannerApi().onPlannerDataChanged(callback);
  },

  async ensureRepositoryProject(...args: Parameters<ElectronAPI['plannerEnsureRepositoryProject']>): ReturnType<ElectronAPI['plannerEnsureRepositoryProject']> {
    return requireElectronPlannerApi().plannerEnsureRepositoryProject(...args);
  },

  async createProject(...args: Parameters<ElectronAPI['plannerCreateProject']>): ReturnType<ElectronAPI['plannerCreateProject']> {
    return requireElectronPlannerApi().plannerCreateProject(...args);
  },

  async updateProject(...args: Parameters<ElectronAPI['plannerUpdateProject']>): ReturnType<ElectronAPI['plannerUpdateProject']> {
    return requireElectronPlannerApi().plannerUpdateProject(...args);
  },

  async deleteProject(...args: Parameters<ElectronAPI['plannerDeleteProject']>): ReturnType<ElectronAPI['plannerDeleteProject']> {
    return requireElectronPlannerApi().plannerDeleteProject(...args);
  },

  async deleteRepositoryProjectByPath(
    ...args: Parameters<ElectronAPI['plannerDeleteRepositoryProjectByPath']>
  ): ReturnType<ElectronAPI['plannerDeleteRepositoryProjectByPath']> {
    return requireElectronPlannerApi().plannerDeleteRepositoryProjectByPath(...args);
  },

  async createItem(...args: Parameters<ElectronAPI['plannerCreateItem']>): ReturnType<ElectronAPI['plannerCreateItem']> {
    return requireElectronPlannerApi().plannerCreateItem(...args);
  },

  async updateItem(...args: Parameters<ElectronAPI['plannerUpdateItem']>): ReturnType<ElectronAPI['plannerUpdateItem']> {
    return requireElectronPlannerApi().plannerUpdateItem(...args);
  },

  async deleteItem(...args: Parameters<ElectronAPI['plannerDeleteItem']>): ReturnType<ElectronAPI['plannerDeleteItem']> {
    return requireElectronPlannerApi().plannerDeleteItem(...args);
  },

  async materializeProject(...args: Parameters<ElectronAPI['plannerMaterializeProject']>): ReturnType<ElectronAPI['plannerMaterializeProject']> {
    return requireElectronPlannerApi().plannerMaterializeProject(...args);
  },
};
