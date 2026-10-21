import type { IpcResult } from '../../types/ipc';

export type UntrackScope = 'file' | 'directory' | 'topDirectory' | 'extension';
export type UntrackScopeOption = { kind: UntrackScope; value: string };
export type UntrackBlockReason = 'indexOnly' | 'conflict' | 'submodule' | 'unsupported' | 'unreadable' | 'tooLarge';
export type UntrackCandidate = {
  id: string;
  path: string;
  ignored: boolean;
  added: boolean;
  blocked?: UntrackBlockReason;
};
export type InspectUntrackFilesRequest = { repoPath: string; operationId: string; path: string; scope: UntrackScope };
export type UntrackFilesInspection = {
  planId: string;
  expiresAt: number;
  scope: UntrackScope;
  scopes: UntrackScopeOption[];
  candidates: UntrackCandidate[];
};
export type ExecuteUntrackFilesRequest = { repoPath: string; operationId: string; planId: string; selectedIds: string[] };
export type UntrackFilesResult = { status: 'applied'; paths: string[] } | { status: 'stale'; reason: 'expired' | 'repository' | 'files' };
export interface UntrackFilesApi {
  inspectUntrackFiles(request: InspectUntrackFilesRequest): Promise<IpcResult<UntrackFilesInspection>>;
  executeUntrackFiles(request: ExecuteUntrackFilesRequest): Promise<IpcResult<UntrackFilesResult>>;
  cancelUntrackFiles(operationId: string): Promise<boolean>;
}

/** Inputs are normalized, repository-relative Git paths; no Git patterns escape this boundary. */
export function untrackScopeOptions(file: string): UntrackScopeOption[] {
  const options: UntrackScopeOption[] = [{ kind: 'file', value: file }];
  const slash = file.lastIndexOf('/');
  if (slash > 0) {
    const directory = file.slice(0, slash);
    options.push({ kind: 'directory', value: directory });
    if (directory.includes('/')) options.push({ kind: 'topDirectory', value: directory.split('/')[0] });
  }
  const name = file.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) options.push({ kind: 'extension', value: name.slice(dot) });
  return options;
}

export function matchesUntrackScope(file: string, scope: UntrackScopeOption): boolean {
  if (scope.kind === 'file') return file === scope.value;
  if (scope.kind === 'extension') return file.slice(file.lastIndexOf('/') + 1).endsWith(scope.value);
  return file.startsWith(`${scope.value}/`);
}
