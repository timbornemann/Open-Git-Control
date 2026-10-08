import type { IpcResult } from '../../types/ipc';

export type GitIdentityScope = 'repository' | 'global';
export type GitIdentityRequest = {
  repoPath: string | null;
  scope: GitIdentityScope;
};
export type GitIdentityStatus = {
  repoPath: string | null;
  scope: GitIdentityScope;
  name: string;
  email: string;
  ready: boolean;
  missing: ('name' | 'email')[];
  revision: string;
};
export type SaveGitIdentityRequest = {
  repoPath: string | null;
  scope: GitIdentityScope;
  name: string;
  email: string;
  expectedRevision: string;
};
export type GitIdentityApi = {
  getGitIdentity: (request: GitIdentityRequest) => Promise<IpcResult<GitIdentityStatus>>;
  saveGitIdentity: (request: SaveGitIdentityRequest) => Promise<IpcResult<GitIdentityStatus>>;
};
const hasControlCharacters = (value: string) => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export const validGitIdentityName = (value: string) =>
  Boolean(value.trim()) && value.trim().length <= 200 && !/[<>]/.test(value) && !hasControlCharacters(value);
export const validGitIdentityEmail = (value: string) =>
  value.trim().length <= 254 && /^[^\s<>@]+@[^\s<>@]+$/.test(value.trim()) && !hasControlCharacters(value);
