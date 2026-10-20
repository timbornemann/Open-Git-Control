import { createHash } from 'node:crypto';
import type { BranchCleanupCandidate, BranchCleanupHostingMetadata, BranchCleanupReason, BranchCleanupTarget } from '../../src/shared/ipc/branchCleanup';
import type { HostedRepositoryRef } from '../../src/types/hostingDtos';

export const CLEANUP_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export const CLEANUP_ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const cleanupDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const cleanupError = (error: unknown) => (error instanceof Error ? error.message : String(error));
export type CleanupGit = { run(repo: string, args: string[], options?: { signal?: AbortSignal }): Promise<string> };
export type CleanupLocalBranch = { name: string; ref: string; oid: string; lastCommitAt: number | null; remote: string; remoteRef: string };
export type CleanupLocalState = {
  branches: CleanupLocalBranch[];
  config: string;
  configValues: Map<string, string>;
  current: string;
  commonDir: string;
  gitDir: string;
  worktrees: Array<{ path: string; branch: string; head: string }>;
  worktreeVersion: string;
  operation: string;
  incomplete: boolean;
};
export type CleanupEndpoint = {
  id: string;
  remoteName: string;
  url: string;
  canDelete: boolean;
  canIsolate: boolean;
  fetchUrl: boolean;
  connectionId: string | null;
  credentialGeneration: number | null;
  repository?: HostedRepositoryRef;
};
export type CleanupRemoteState = {
  endpoint: CleanupEndpoint;
  heads: Map<string, string>;
  defaultBranch: string;
  complete: boolean;
  metadata: BranchCleanupHostingMetadata | null;
  problem?: string;
};
export type CleanupInternalTarget = BranchCleanupTarget & { branch: string; localRef?: string; endpointId?: string };
export type CleanupAnalysis = {
  local: CleanupLocalState;
  remotes: CleanupRemoteState[];
  targets: CleanupInternalTarget[];
  candidates: BranchCleanupCandidate[];
  comparisons: Array<{ id: string; label: string; targetId: string | null }>;
  warnings: string[];
  fingerprint: string;
};
export type CleanupContext = {
  ownerId: number;
  generation: number;
  signal: AbortSignal;
  ensureActive(): void;
  progress(phase: string): void;
};

export const cleanupReason = (code: BranchCleanupReason['code'], detail?: string): BranchCleanupReason => ({ code, ...(detail ? { detail } : {}) });
export const sameCleanupRepository = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function cleanupOpenRequests(remote: CleanupRemoteState, name: string): string[] {
  const metadata = remote.metadata;
  if (!metadata) return [];
  return metadata.openRequests
    .filter(
      (request) =>
        (sameCleanupRepository(request.sourceRepository, metadata.repository.fullPath) && request.sourceBranch === name) ||
        (sameCleanupRepository(request.targetRepository, metadata.repository.fullPath) && request.targetBranch === name),
    )
    .map((request) => `#${request.number}`);
}

export function cleanupMetadataKnown(remote: CleanupRemoteState, name: string): boolean {
  const branch = remote.metadata?.branches.find((entry) => entry.name === name);
  return Boolean(remote.complete && remote.metadata?.complete && branch && branch.protected !== null && branch.oid === remote.heads.get(name));
}

export function cleanupLocalLinks(
  local: CleanupLocalBranch,
  remote: CleanupRemoteState,
  name: string,
  pushMappings: Record<string, Record<string, string>>,
): boolean {
  return (
    local.name === name ||
    (local.remote === remote.endpoint.remoteName && local.remoteRef === `refs/heads/${name}`) ||
    pushMappings[local.name]?.[remote.endpoint.remoteName] === name
  );
}
