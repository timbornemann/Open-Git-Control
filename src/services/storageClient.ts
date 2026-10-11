import type { ElectronStorageAPI } from '@/shared/ipc/storageMaintenance';
import { getElectronApi, requireElectronAppApi } from './electronApi';

export const storageClient = {
  isAvailable: () => typeof getElectronApi()?.app?.inspectStorage === 'function',
  hasUiPreferences: () => typeof getElectronApi()?.app?.getRepositoryUiPreferences === 'function',
  uiPreferences: (...args: Parameters<ElectronStorageAPI['getRepositoryUiPreferences']>) => requireElectronAppApi().getRepositoryUiPreferences(...args),
  updateUiPreferences: (...args: Parameters<ElectronStorageAPI['updateRepositoryUiPreferences']>) =>
    requireElectronAppApi().updateRepositoryUiPreferences(...args),
  inspect: () => requireElectronAppApi().inspectStorage(),
  run: (...args: Parameters<ElectronStorageAPI['runStorageMaintenance']>) => requireElectronAppApi().runStorageMaintenance(...args),
  restore: (...args: Parameters<ElectronStorageAPI['restoreRemovedRepository']>) => requireElectronAppApi().restoreRemovedRepository(...args),
  subscribe: (...args: Parameters<ElectronStorageAPI['onStorageMaintenance']>) => requireElectronAppApi().onStorageMaintenance(...args),
  recovery: () => requireElectronAppApi().getCompletedRecoveryBackups(),
  removeRecovery: (...args: Parameters<ElectronStorageAPI['removeCompletedRecoveryBackups']>) =>
    requireElectronAppApi().removeCompletedRecoveryBackups(...args),
};
