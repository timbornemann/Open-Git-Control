import type { AiAutoCommitResultDto, AiConnectionResultDto, AiGeneratedCommitMessageDto, GitJobEventDto, IpcResult } from '../../../global';
import type { ElectronReleaseNotesAPI } from './github';

export interface ElectronAiAPI extends ElectronReleaseNotesAPI {
  aiTestConnection: () => Promise<IpcResult<AiConnectionResultDto>>;
  aiListModels: () => Promise<IpcResult<string[]>>;
  ollamaTestConnection: () => Promise<IpcResult<AiConnectionResultDto>>;
  ollamaListModels: () => Promise<IpcResult<string[]>>;
  runAiAutoCommit: () => Promise<IpcResult<AiAutoCommitResultDto>>;
  cancelAiAutoCommit: () => Promise<{ success: boolean; canceled: boolean }>;
  getAiAutoCommitState: () => Promise<IpcResult<GitJobEventDto | null>>;
  aiGenerateCommitMessage: (params: { notes: string }) => Promise<IpcResult<AiGeneratedCommitMessageDto>>;
  onJobEvent: (callback: (event: GitJobEventDto) => void) => () => void;
}
