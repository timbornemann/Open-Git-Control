import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { requireElectronGitApi } from './electronApi';

export const diffClient = {
  async getDiffPreview(...args: Parameters<ElectronAPI['getDiffPreview']>): ReturnType<ElectronAPI['getDiffPreview']> {
    return requireElectronGitApi().getDiffPreview(...args);
  },
  async applyPatch(...args: Parameters<ElectronAPI['applyPatch']>): ReturnType<ElectronAPI['applyPatch']> {
    return requireElectronGitApi().applyPatch(...args);
  },
  async applyDiffLineSelection(...args: Parameters<ElectronAPI['applyDiffLineSelection']>): ReturnType<ElectronAPI['applyDiffLineSelection']> {
    return requireElectronGitApi().applyDiffLineSelection(...args);
  },
};
