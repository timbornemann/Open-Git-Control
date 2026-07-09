import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService, RepositoryFileSource } from '../../../GitService';
import { IpcChannel } from '../../../../src/types/ipcContract';

type RegisterGitFileHandlersDeps = {
  gitService: GitService;
};

const REPOSITORY_FILE_SOURCES = new Set<RepositoryFileSource>(['unstaged', 'staged', 'commit']);

const normalizeRepositoryFileSource = (value: unknown): RepositoryFileSource => {
  const source = String(value || '').trim();
  if (!REPOSITORY_FILE_SOURCES.has(source as RepositoryFileSource)) {
    throw new Error('Invalid repository file source.');
  }
  return source as RepositoryFileSource;
};

export function registerGitFileHandlers({ gitService }: RegisterGitFileHandlersDeps): void {
  ipcMain.handle(IpcChannel.GitReadRepoFile, async (_event: unknown, filePath: unknown) => {
    try {
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const data = await gitService.files.readRepoFile(normalizedPath);
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitMarkdownPreviewFile, async (_event: unknown, params: { source?: unknown; path?: unknown; commitHash?: unknown } = {}) => {
    try {
      const source = normalizeRepositoryFileSource(params.source);
      const filePath = String(params.path || '').trim();
      if (!filePath) {
        return { success: false, error: 'File path is required' };
      }

      const text = await gitService.files.readRepositoryFileTextAtSource(
        source,
        filePath,
        typeof params.commitHash === 'string' ? params.commitHash : undefined,
      );
      return { success: true, data: { text } };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitRepoFileDataUrl, async (_event: unknown, params: { source?: unknown; path?: unknown; commitHash?: unknown } = {}) => {
    try {
      const source = normalizeRepositoryFileSource(params.source);
      const filePath = String(params.path || '').trim();
      if (!filePath) {
        return { success: false, error: 'File path is required' };
      }

      const data = await gitService.files.readRepositoryImageDataUrlAtSource(
        source,
        filePath,
        typeof params.commitHash === 'string' ? params.commitHash : undefined,
      );
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitWriteRepoFile, async (_event: unknown, filePath: unknown, content: unknown) => {
    try {
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      await gitService.files.writeRepoFile(normalizedPath, typeof content === 'string' ? content : String(content ?? ''));
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitOpenSubmodule, async (_event: unknown, submodulePath: unknown) => {
    try {
      const relativePath = String(submodulePath || '').trim();
      if (!relativePath) {
        return { success: false, error: 'Submodule path is required.' };
      }

      const repoPath = gitService.getRepoPath();
      if (!repoPath) {
        return { success: false, error: 'No repository path set.' };
      }

      const resolvedPath = path.resolve(repoPath, relativePath);
      const relativeFromRepo = path.relative(repoPath, resolvedPath);
      if (relativeFromRepo.startsWith('..') || path.isAbsolute(relativeFromRepo)) {
        return { success: false, error: 'Submodule path is outside the current repository.' };
      }

      const openError = await shell.openPath(resolvedPath);
      if (openError) {
        return { success: false, error: openError };
      }

      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitAddIgnoreRule, async (_event: unknown, pattern: string) => {
    try {
      const normalizedPattern = String(pattern || '')
        .trim()
        .replace(/\\/g, '/');
      if (!normalizedPattern) {
        return { success: false, error: 'Pattern is required' };
      }
      if (normalizedPattern.length > 400) {
        return { success: false, error: 'Pattern is too long' };
      }
      if (/\r|\n/.test(normalizedPattern)) {
        return { success: false, error: 'Pattern must be a single line' };
      }

      const selectedRepo = gitService.getRepoPath();
      if (!selectedRepo) {
        return { success: false, error: 'No repository selected' };
      }

      const repoRoot = await gitService.runCommand(['rev-parse', '--show-toplevel']);
      const gitignorePath = path.join(repoRoot, '.gitignore');
      const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
      const existingRules = new Set(
        existing
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      );

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
