import type { IpcResult } from '../../types/ipc';

export type GitLfsSource = 'staged' | 'unstaged';
export type GitLfsFileRequest = { path: string; source: GitLfsSource };
export type GitLfsFileState = GitLfsFileRequest & {
  version: string;
  bytes: number;
  eligible: boolean;
  reason?: string;
  configured: boolean;
  pointer: boolean;
  needsRestage: boolean;
  extension?: string;
  recommendation?: 'asset' | 'binary';
};
export type GitLfsStatusRequest = { repoPath: string; files: GitLfsFileRequest[] };
export type GitLfsStatus = { available: boolean; error?: string; files: GitLfsFileState[] };
export type TrackWithGitLfsRequest = GitLfsFileRequest & {
  repoPath: string;
  expectedVersion: string;
  scope: 'file' | 'extension';
};
export type TrackWithGitLfsResult = { path: string; attributesPath: string; oid: string; bytes: number };
export type GitLfsApi = {
  getGitLfsStatus: (request: GitLfsStatusRequest) => Promise<IpcResult<GitLfsStatus>>;
  trackWithGitLfs: (request: TrackWithGitLfsRequest) => Promise<IpcResult<TrackWithGitLfsResult>>;
};
export type GitLfsPointer = { oid: string; size: number };

/** Pointer recognition is independent of file extensions and working attributes. */
export function parseGitLfsPointer(text: string): GitLfsPointer | null {
  if (text.length > 1024 || !text.startsWith('version https://git-lfs.github.com/spec/v1\n')) return null;
  const oid = /^oid sha256:([a-f0-9]{64})$/m.exec(text)?.[1];
  const sizeText = /^size (0|[1-9][0-9]*)$/m.exec(text)?.[1];
  const size = Number(sizeText);
  if (!oid || sizeText === undefined || !Number.isSafeInteger(size) || size < 0) return null;
  const lines = text.trimEnd().split('\n');
  if (lines.length < 3 || lines.some((line) => !/^(?:version |oid |size |ext-[0-9]+-)/.test(line))) return null;
  if (['version ', 'oid ', 'size '].some((key) => lines.filter((line) => line.startsWith(key)).length !== 1)) return null;
  return { oid, size };
}
