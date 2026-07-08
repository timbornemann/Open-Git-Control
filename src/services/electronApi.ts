import type { ElectronAPI } from '../global';

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
