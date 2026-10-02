import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { refreshRewrittenHistory } from '@/data/commitMessageEdit';
import { requireElectronGitApi } from './electronApi';

export const commitMessageEdits = {
  inspectCommitMessageEdit(...args: Parameters<ElectronAPI['inspectCommitMessageEdit']>): ReturnType<ElectronAPI['inspectCommitMessageEdit']> {
    return requireElectronGitApi().inspectCommitMessageEdit(...args);
  },
  async rewordCommitMessage(...args: Parameters<ElectronAPI['rewordCommitMessage']>): ReturnType<ElectronAPI['rewordCommitMessage']> {
    const result = await requireElectronGitApi().rewordCommitMessage(...args);
    if (result.success && result.data.changed) await refreshRewrittenHistory(args[0].repoPath);
    return result;
  },
  getCommitMessageEditBackups(...args: Parameters<ElectronAPI['getCommitMessageEditBackups']>): ReturnType<ElectronAPI['getCommitMessageEditBackups']> {
    return requireElectronGitApi().getCommitMessageEditBackups(...args);
  },
  cancelCommitMessageEdit(operationId: string): Promise<boolean> {
    return requireElectronGitApi().cancelCommitMessageEdit(operationId);
  },
  onCommitMessageEditProgress(...args: Parameters<ElectronAPI['onJobEvent']>): ReturnType<ElectronAPI['onJobEvent']> {
    return requireElectronGitApi().onJobEvent(...args);
  },
};
