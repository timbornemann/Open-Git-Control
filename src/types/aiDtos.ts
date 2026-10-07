import type { SecretScanProgressDto } from './secretScan';

export type GitJobStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';
export type GitJobPhaseDto = 'snapshot' | 'context' | 'grouping' | 'validating' | 'committing' | 'retry' | 'fallback' | 'done' | 'failed' | 'cancelled';

export type AiProviderDto = 'ollama' | 'gemini' | 'openai';
export type AiCommitMessageStyleDto = 'conventional' | 'plain' | 'detailed';
export type AiCommitMessageLanguageDto = 'auto' | 'de' | 'en';
export type AiAutoCommitModeDto = 'normal' | 'retry' | 'fallback';

export interface GitJobEventDto {
  /** Unique ID for one emitted event. `id` identifies the enclosing job. */
  eventId?: string;
  id: string;
  operation: string;
  status: GitJobStatus;
  message?: string;
  progress?: number;
  details?: {
    secretScan?: SecretScanProgressDto;
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
  outcome?: 'complete' | 'partial' | 'cancelled';
  error?: string;
  groups?: AiAutoCommitGroupDto[];
  metrics?: { snapshotMs: number; contextMs: number; aiMs: number; gitMs: number; providerCalls: number; contextCacheHits: number; contextBytes: number };
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

export interface AiAutoCommitGroupDto {
  id: string;
  source: 'staged' | 'worktree';
  changeIds: string[];
  paths: string[];
  title: string;
  description: string;
  rationale: string;
  messageSource: 'ai' | 'fallback';
  status: 'pending' | 'committed';
  hash?: string;
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
