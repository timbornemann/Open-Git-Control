import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import type { DiffRequest } from '@/types/diff';
import type { EditorPosition } from '@/types/editor';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export type FileViewerTab = 'text' | 'diff' | 'preview' | 'table' | 'history' | 'blame';
export type FileViewerRequest = RepositoryFileContextDto & { startView: 'text' | 'diff'; position?: EditorPosition };
export function fileViewerIdentity(request: RepositoryFileContextDto): string {
  return JSON.stringify([normalizeRepoPathKey(request.repoPath), request.path, request.source, request.commitHash || '']);
}
export function repositoryFileContext(request: FileViewerRequest): RepositoryFileContextDto {
  return { repoPath: request.repoPath, path: request.path, source: request.source, ...(request.commitHash ? { commitHash: request.commitHash } : {}) };
}
export function fileViewerRequestFromDiff(repoPath: string, request: DiffRequest): FileViewerRequest {
  return { repoPath, path: request.path, source: request.source, commitHash: request.commitHash, startView: 'diff' };
}
export function fileViewerRequestFromWorkingFile(repoPath: string, path: string, position?: EditorPosition): FileViewerRequest {
  return { repoPath, path, source: 'unstaged', startView: 'text', ...(position ? { position } : {}) };
}
