export type GitJobStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';
export type GitJobPhaseDto = 'snapshot' | 'grouping' | 'committing' | 'retry' | 'fallback' | 'done' | 'failed' | 'cancelled';

export type AiProviderDto = 'ollama' | 'gemini' | 'openai';
export type AiCommitMessageStyleDto = 'conventional' | 'plain' | 'detailed';
export type AiCommitMessageLanguageDto = 'auto' | 'de' | 'en';
export type AiAutoCommitModeDto = 'normal' | 'retry' | 'fallback';

export interface GitJobEventDto {
  id: string;
  operation: string;
  status: GitJobStatus;
  message?: string;
  progress?: number;
  details?: {
    phase?: GitJobPhaseDto;
    mode?: AiAutoCommitModeDto | string;
    groupId?: number;
    groupSize?: number;
    remainingFiles?: number;
    processedFiles?: number;
    totalCommits?: number;
    lastCommit?: string | null;
    retryCount?: number;
    [key: string]: unknown;
  };
  timestamp: number;
}

export interface AiAutoCommitCommitDto {
  hash: string;
  subject: string;
}

export interface AiAutoCommitResultDto {
  commits: AiAutoCommitCommitDto[];
  summary: string;
  turns: number;
  modeTransitions: string[];
  processedFiles: number;
  remainingFiles: number;
  commitPlanStats: {
    groupCount: number;
    retries: number;
    fallbackCommits: number;
    totalCommits: number;
    totalFilesProcessed: number;
  };
  warnings: string[];
  diagnostics: string[];
}

export interface AiConnectionResultDto {
  ok: true;
  provider: AiProviderDto;
  model: string;
  detail: string;
}

export interface AiGeneratedCommitMessageDto {
  title: string;
  description: string;
}
