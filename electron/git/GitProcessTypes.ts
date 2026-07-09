import { execFile } from 'child_process';
import * as util from 'util';
import type { GitJobKind } from '../GitScheduler';

const execFileAsync = util.promisify(execFile);

export type ExecFileAsyncResult = { stdout: string; stderr: string };

export type GitExecFileOptions = {
  cwd: string;
  maxBuffer: number;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export type ExecFileAsyncRunner = (file: string, args: string[], options: GitExecFileOptions) => Promise<ExecFileAsyncResult>;

export const defaultExecFileAsyncRunner = execFileAsync as ExecFileAsyncRunner;

export type GitRunOptions = {
  envOverrides?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  requestedKind?: GitJobKind;
  coalesceKey?: string;
};

export type GitBufferRunOptions = {
  maxBytes: number;
  tooLargeMessage: string;
  requestedKind?: GitJobKind;
  commandName?: string;
};

export type GitInputRunOptions = {
  requestedKind?: GitJobKind;
  commandName?: string;
};

export type DiffPreviewResult = {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
};

export type GitCloneProgressResult = {
  success: boolean;
  error?: string;
};

export const readGitProcessErrorText = (error: unknown, key: 'stdout' | 'stderr' | 'message' | 'name' | 'code'): string => {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : String(value ?? '');
};

export const createAbortError = (message: string): Error => {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};
