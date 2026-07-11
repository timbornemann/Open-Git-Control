import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import type { GitService, RepositoryFileSource } from '../../../GitService';
import { resolveExistingRepositoryPath, resolveRepositoryPathForCreate } from '../../../git/RepositoryPathSafety';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';

type RegisterGitFileHandlersDeps = {
  gitService: GitService;
};

const REPOSITORY_FILE_SOURCES = new Set<RepositoryFileSource>(['unstaged', 'staged', 'commit']);

// Never trim a repository-relative path: leading/trailing whitespace is a
// significant part of a Git filename. Only reject an entirely empty value.
const asRepositoryFilePath = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

const normalizeRepositoryFileSource = (value: unknown): RepositoryFileSource => {
  const source = String(value || '').trim();
  if (!REPOSITORY_FILE_SOURCES.has(source as RepositoryFileSource)) {
    throw new Error('Invalid repository file source.');
  }
  return source as RepositoryFileSource;
};

export function registerGitFileHandlers({ gitService }: RegisterGitFileHandlersDeps): void {
  ipcMain.handle(IpcChannel.GitReadRepoFile, async (_event: unknown, filePath: unknown, requestedRepoPath?: unknown) => {
    try {
      const repositoryFilePath = asRepositoryFilePath(filePath);
      if (repositoryFilePath.length === 0) {
        return { success: false, error: 'File path is required' };
      }

      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const data = await gitService.files.readRepoFileAtPath(repoPath, repositoryFilePath);
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    IpcChannel.GitMarkdownPreviewFile,
    async (_event: unknown, params: { source?: unknown; path?: unknown; commitHash?: unknown; repoPath?: unknown } = {}) => {
      try {
        const source = normalizeRepositoryFileSource(params.source);
        const filePath = asRepositoryFilePath(params.path);
        if (filePath.length === 0) {
          return { success: false, error: 'File path is required' };
        }

        const repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
        const text = await gitService.files.readRepositoryFileTextAtSourceAndPath(
          repoPath,
          source,
          filePath,
          typeof params.commitHash === 'string' ? params.commitHash : undefined,
        );
        return { success: true, data: { text } };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.GitRepoFileDataUrl,
    async (_event: unknown, params: { source?: unknown; path?: unknown; commitHash?: unknown; repoPath?: unknown } = {}) => {
      try {
        const source = normalizeRepositoryFileSource(params.source);
        const filePath = asRepositoryFilePath(params.path);
        if (filePath.length === 0) {
          return { success: false, error: 'File path is required' };
        }

        const repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
        const data = await gitService.files.readRepositoryImageDataUrlAtSourceAndPath(
          repoPath,
          source,
          filePath,
          typeof params.commitHash === 'string' ? params.commitHash : undefined,
        );
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitWriteRepoFile, async (_event: unknown, filePath: unknown, content: unknown, requestedRepoPath?: unknown) => {
    try {
      const repositoryFilePath = asRepositoryFilePath(filePath);
      if (repositoryFilePath.length === 0) {
        return { success: false, error: 'File path is required' };
      }

      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      await gitService.files.writeRepoFileAtPath(repoPath, repositoryFilePath, typeof content === 'string' ? content : String(content ?? ''));
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitOpenSubmodule, async (_event: unknown, submodulePath: unknown, requestedRepoPath?: unknown) => {
    try {
      const relativePath = String(submodulePath || '').trim();
      if (!relativePath) {
        return { success: false, error: 'Submodule path is required.' };
      }

      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());

      const resolvedPath = resolveExistingRepositoryPath(repoPath, relativePath, 'Submodule path');

      const openError = await shell.openPath(resolvedPath);
      if (openError) {
        return { success: false, error: openError };
      }

      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitAddIgnoreRule, async (_event: unknown, pattern: string, requestedRepoPath?: unknown) => {
    try {
      const normalizedPattern = String(pattern || '');
      if (!normalizedPattern.trim()) {
        return { success: false, error: 'Pattern is required' };
      }
      if (normalizedPattern.length > 400) {
        return { success: false, error: 'Pattern is too long' };
      }
      if (/\r|\n/.test(normalizedPattern)) {
        return { success: false, error: 'Pattern must be a single line' };
      }

      // Pin the write to the repository the renderer requested, rejecting it if
      // the active repository changed in the meantime, so the .gitignore edit
      // and any follow-up unstage never target different repositories.
      const selectedRepo = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());

      const repoRoot = await gitService.runCommandAtPath(selectedRepo, ['rev-parse', '--show-toplevel']);
      const gitignorePath = resolveRepositoryPathForCreate(repoRoot, '.gitignore');
      const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
      const existingRules = new Set(existing.split(/\r?\n/).filter((line) => line.length > 0));

      if (existingRules.has(normalizedPattern)) {
        return { success: true, added: false, pattern: normalizedPattern };
      }

      const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith('\r\n');
      const nextContent = `${needsLeadingNewline ? '\n' : ''}${normalizedPattern}\n`;
      fs.appendFileSync(gitignorePath, nextContent, 'utf-8');
      return { success: true, added: true, pattern: normalizedPattern };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
