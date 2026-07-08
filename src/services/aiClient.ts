import type { ElectronAPI } from '@/global';
import { getElectronApi, requireElectronApi } from './electronApi';

export const aiClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async testConnection(...args: Parameters<ElectronAPI['aiTestConnection']>): ReturnType<ElectronAPI['aiTestConnection']> {
    return requireElectronApi().aiTestConnection(...args);
  },

  async listModels(...args: Parameters<ElectronAPI['aiListModels']>): ReturnType<ElectronAPI['aiListModels']> {
    return requireElectronApi().aiListModels(...args);
  },

  async runAutoCommit(...args: Parameters<ElectronAPI['runAiAutoCommit']>): ReturnType<ElectronAPI['runAiAutoCommit']> {
    return requireElectronApi().runAiAutoCommit(...args);
  },

  async cancelAutoCommit(...args: Parameters<ElectronAPI['cancelAiAutoCommit']>): ReturnType<ElectronAPI['cancelAiAutoCommit']> {
    return requireElectronApi().cancelAiAutoCommit(...args);
  },

  async getAutoCommitState(...args: Parameters<ElectronAPI['getAiAutoCommitState']>): ReturnType<ElectronAPI['getAiAutoCommitState']> {
    return requireElectronApi().getAiAutoCommitState(...args);
  },

  async generateCommitMessage(...args: Parameters<ElectronAPI['aiGenerateCommitMessage']>): ReturnType<ElectronAPI['aiGenerateCommitMessage']> {
    return requireElectronApi().aiGenerateCommitMessage(...args);
  },

  onJobEvent(...args: Parameters<ElectronAPI['onJobEvent']>): ReturnType<ElectronAPI['onJobEvent']> {
    return requireElectronApi().onJobEvent(...args);
  },
};
