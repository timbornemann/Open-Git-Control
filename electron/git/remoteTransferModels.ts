import { createHash } from 'crypto';
import type { GitPushPlanDto, GitPushBatchDto } from '../../src/types/remoteTransfers';
import type { GitRunner } from './GitRunner';
import type { PublishedRef } from './remotePushResults';
import { redactGitSensitiveText } from './GitErrorFormatter';

export type CredentialEnvironmentFactory = (input: {
  connectionId?: string | null;
  urls: string[];
  signal?: AbortSignal;
  envOverrides?: NodeJS.ProcessEnv;
  expectedGeneration?: number;
}) => Promise<{ envOverrides: NodeJS.ProcessEnv; signal?: AbortSignal; dispose: () => void | Promise<void> }>;
export type RemoteTransferContext = {
  ownerId: number;
  generation: number;
  signal?: AbortSignal;
  ensureActive: () => void;
  onProgress?: (message: string) => void;
  authorizePush?: (args: string[]) => Promise<void>;
};
export type StoredPlan = {
  dto: GitPushPlanDto;
  refs: PublishedRef[];
  fingerprint: string;
  ownerId: number;
  generation: number;
  expiresAt: number;
  executed: boolean;
  connections: Record<string, string | null>;
  credentialGenerations: Record<string, number>;
};
export type StoredBatch = { dto: GitPushBatchDto; plan: StoredPlan };
export type Runner = Pick<GitRunner, 'run' | 'runResult' | 'streamOutput'>;

export function boundCredentialGenerations(connections: Record<string, string | null>, generations: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const id of Object.values(connections)) if (id) result[id] = generations[id];
  return result;
}

export function pruneTransfers(plans: Map<string, StoredPlan>, batches: Map<string, StoredBatch>): void {
  for (const [id, plan] of plans) if (plan.expiresAt < Date.now()) plans.delete(id);
  for (const [id, batch] of batches) if (batch.plan.expiresAt < Date.now()) batches.delete(id);
}

export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const lines = (value: string): string[] => value.split(/\r?\n/).filter(Boolean);
export const PLAN_LIFETIME = 15 * 60_000;
export const displayUrl = (value: string): string =>
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^\s/@:]+@/i.test(value) && !/^https?:\/\//i.test(value)
    ? value.replace(/\b(?:github_pat_[a-z0-9_-]+|gh[a-z]+_[a-z0-9_-]+|glpat-[a-z0-9_-]+)\b/gi, '[REDACTED]')
    : redactGitSensitiveText(value);
