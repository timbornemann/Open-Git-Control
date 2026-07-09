import type { ElectronAPI } from '@/global';
import { getElectronApi, requireElectronAiApi } from './electronApi';

export const aiClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async testConnection(...args: Parameters<ElectronAPI['aiTestConnection']>): ReturnType<ElectronAPI['aiTestConnection']> {
    return requireElectronAiApi().aiTestConnection(...args);
  },

  async listModels(...args: Parameters<ElectronAPI['aiListModels']>): ReturnType<ElectronAPI['aiListModels']> {
    return requireElectronAiApi().aiListModels(...args);
  },

  async runAutoCommit(...args: Parameters<ElectronAPI['runAiAutoCommit']>): ReturnType<ElectronAPI['runAiAutoCommit']> {
    return requireElectronAiApi().runAiAutoCommit(...args);
  },

  async cancelAutoCommit(...args: Parameters<ElectronAPI['cancelAiAutoCommit']>): ReturnType<ElectronAPI['cancelAiAutoCommit']> {
    return requireElectronAiApi().cancelAiAutoCommit(...args);
  },

  async getAutoCommitState(...args: Parameters<ElectronAPI['getAiAutoCommitState']>): ReturnType<ElectronAPI['getAiAutoCommitState']> {
    return requireElectronAiApi().getAiAutoCommitState(...args);
  },

  async generateCommitMessage(...args: Parameters<ElectronAPI['aiGenerateCommitMessage']>): ReturnType<ElectronAPI['aiGenerateCommitMessage']> {
    return requireElectronAiApi().aiGenerateCommitMessage(...args);
  },

  onJobEvent(...args: Parameters<ElectronAPI['onJobEvent']>): ReturnType<ElectronAPI['onJobEvent']> {
    return requireElectronAiApi().onJobEvent(...args);
  },
};
