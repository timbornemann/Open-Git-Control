import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService, RepositoryFileSource } from '../../../GitService';
import {
  resolveExistingRepositoryPath,
  resolveExistingRepositoryPathWithoutSymlinks,
  resolveRepositoryPathForCreate,
  resolveRepositoryPathForCreateWithoutSymlinks,
} from '../../../git/RepositoryPathSafety';
import { repositoryPathKey, requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { decodeRepositoryFile, detectRepositoryFileEncoding } from '../../../git/RepositoryFileEncoding';
import { registerWorkingDirectoryFileInfoHandler } from './workingDirectoryFileInfo';
import { registerWorkingDirectoryFileCreationHandler } from './workingDirectoryFileCreation';
import { registerWorkingDirectoryToolsHandlers } from './workingDirectoryTools';

type RegisterGitFileHandlersDeps = {
  gitService: GitService;
  readStoredRepoPaths?: () => string[];
};

const REPOSITORY_FILE_SOURCES = new Set<RepositoryFileSource>(['unstaged', 'staged', 'commit']);
const REPOSITORY_PATH_OPEN_ACTIONS = new Set(['reveal', 'open', 'openWith']);
const WORKING_DIRECTORY_PREVIEW_LIMIT = 2 * 1024 * 1024;
const WORKING_DIRECTORY_LARGE_IMAGE_PREVIEW_LIMIT = 25 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Map([
  ['apng', 'image/apng'],
  ['avif', 'image/avif'],
  ['bmp', 'image/bmp'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
]);

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
const findExistingParentPath = (targetPath: string): string => {
  let currentPath = targetPath;
  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error('No existing parent directory was found.');
    }
    currentPath = parentPath;
  }
  return currentPath;
};

const createSiblingTemporaryPath = (targetPath: string, purpose: string): string =>
  path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.ogc-${purpose}-${process.pid}-${randomUUID()}`);

const lstatIfExists = (targetPath: string): fs.Stats | null => {
  try {
    return fs.lstatSync(targetPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

const readIgnoreFileSafely = (repoRoot: string): { targetPath: string; content: string; mode: number } => {
  const targetPath = resolveRepositoryPathForCreate(repoRoot, '.gitignore', 'Ignore file');
  const targetStats = lstatIfExists(targetPath);
  if (!targetStats) {
    return { targetPath, content: '', mode: 0o644 };
  }
  // Do not follow either kind of filesystem indirection. In particular,
  // appendFile follows dangling links and mutates the target of hard links.
  if (targetStats.isSymbolicLink()) throw new Error('Ignore file must not be a symbolic link.');
  if (!targetStats.isFile()) throw new Error('Ignore file must be a regular file.');
  if (targetStats.nlink > 1) throw new Error('Ignore file must not have hard links.');

  const physicalTargetPath = resolveExistingRepositoryPath(repoRoot, '.gitignore', 'Ignore file');
  const physicalStats = fs.lstatSync(physicalTargetPath);
  if (!physicalStats.isFile() || physicalStats.isSymbolicLink() || physicalStats.nlink > 1) {
    throw new Error('Ignore file must be an unlinked regular file.');
  }
  return { targetPath, content: fs.readFileSync(physicalTargetPath, 'utf-8'), mode: targetStats.mode & 0o777 };
};

const replaceIgnoreFileAtomically = (targetPath: string, content: string, mode: number): void => {
  const temporaryPath = createSiblingTemporaryPath(targetPath, 'ignore');
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(descriptor, content, 'utf-8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    // Renaming replaces a link itself rather than following it, so even a
    // concurrent path swap cannot redirect this write outside the repository.
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (lstatIfExists(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
};

const restoreReplacedTarget = (targetPath: string, backupPath: string | null): boolean => {
  if (!backupPath || !fs.existsSync(backupPath)) return true;
  try {
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true });
    fs.renameSync(backupPath, targetPath);
    return true;
  } catch {
    return false;
  }
};

const publishReplacement = (preparedPath: string, targetPath: string, overwrite: boolean): void => {
  let backupPath: string | null = null;
  let retainBackup = false;
  if (fs.existsSync(targetPath)) {
    if (!overwrite) throw new Error('Target already exists.');
    backupPath = createSiblingTemporaryPath(targetPath, 'backup');
    fs.renameSync(targetPath, backupPath);
  }
  try {
    fs.renameSync(preparedPath, targetPath);
  } catch (error) {
    retainBackup = !restoreReplacedTarget(targetPath, backupPath);
    throw error;
  } finally {
    if (!retainBackup && backupPath && fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });
  }
};

const openWithSystemChooser = async (targetPath: string): Promise<void> => {
  if (process.platform !== 'win32') {
    const openError = await shell.openPath(targetPath);
    if (openError) throw new Error(openError);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', targetPath], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
};

export function registerGitFileHandlers({ gitService, readStoredRepoPaths = () => [] }: RegisterGitFileHandlersDeps): void {
  const workingDirectoryPath = (repoPath: string, value: unknown, label: string, allowMissing = false) => {
    const relativePath = asRepositoryFilePath(value);
    if (!relativePath) throw new Error(`${label} is required.`);
    return allowMissing
      ? resolveRepositoryPathForCreateWithoutSymlinks(repoPath, relativePath, label)
      : resolveExistingRepositoryPathWithoutSymlinks(repoPath, relativePath, label);
  };

  ipcMain.handle(IpcChannel.GitListWorkingDirectory, async (_event: unknown, requestedRepoPath?: unknown, requestedParentPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const parentPath = asRepositoryFilePath(requestedParentPath);
      const directoryPath = parentPath ? workingDirectoryPath(repoPath, parentPath, 'Directory path') : fs.realpathSync(repoPath);
      if (!fs.statSync(directoryPath).isDirectory()) throw new Error('Target path is not a directory.');
      const entries: Array<{ path: string; name: string; kind: 'file' | 'directory'; bytes?: number }> = [];
      for (const item of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        // Project dotfiles (for example .gitignore and .github) are ordinary
        // working-tree entries. Git metadata remains inaccessible through the
        // path-safety boundary and is not useful to expose in this browser.
        if (item.name.toLowerCase() === '.git') continue;
        const childRelativePath = parentPath ? `${parentPath}/${item.name}` : item.name;
        const childAbsolutePath = path.join(directoryPath, item.name);
        if (item.isDirectory()) {
          entries.push({ path: childRelativePath, name: item.name, kind: 'directory' });
        } else if (item.isFile()) {
          entries.push({ path: childRelativePath, name: item.name, kind: 'file', bytes: fs.statSync(childAbsolutePath).size });
        }
      }
      return { success: true, data: entries };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  registerWorkingDirectoryFileInfoHandler({ gitService, workingDirectoryPath });
  registerWorkingDirectoryFileCreationHandler({ gitService, workingDirectoryPath });
  registerWorkingDirectoryToolsHandlers({ gitService, workingDirectoryPath });

  ipcMain.handle(
    IpcChannel.GitGetWorkingDirectoryPreview,
    async (_event: unknown, filePath: unknown, requestedRepoPath?: unknown, allowLargeImage?: unknown) => {
      try {
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const resolvedPath = workingDirectoryPath(repoPath, filePath, 'File path');
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) throw new Error('Target path is not a file.');
        const extension = path.extname(resolvedPath).slice(1).toLowerCase();
        const mimeType = IMAGE_MIME_TYPES.get(extension) || null;
        if (stat.size > WORKING_DIRECTORY_PREVIEW_LIMIT && (!mimeType || allowLargeImage !== true || stat.size > WORKING_DIRECTORY_LARGE_IMAGE_PREVIEW_LIMIT)) {
          return {
            success: true,
            data: {
              kind: 'binary',
              bytes: stat.size,
              mimeType,
              reason: 'tooLarge',
              canLoadImage: Boolean(mimeType) && stat.size <= WORKING_DIRECTORY_LARGE_IMAGE_PREVIEW_LIMIT,
            },
          };
        }
        const buffer = fs.readFileSync(resolvedPath);
        if (mimeType)
          return { success: true, data: { kind: 'image', dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType, bytes: stat.size } };
        if (detectRepositoryFileEncoding(buffer) === 'binary')
          return { success: true, data: { kind: 'binary', bytes: stat.size, mimeType: null, reason: 'binary' } };
        return {
          success: true,
          data: { kind: 'text', text: decodeRepositoryFile(buffer).text, bytes: stat.size, isMarkdown: /\.md(?:own)?$/i.test(String(filePath)) },
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  const mutateWorkingDirectory =
    (operation: 'move' | 'copy') =>
    async (_event: unknown, params: { sourcePath?: unknown; targetPath?: unknown; overwrite?: unknown } = {}, requestedRepoPath?: unknown) => {
      try {
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const sourcePath = workingDirectoryPath(repoPath, params.sourcePath, 'Source path');
        const targetPath = workingDirectoryPath(repoPath, params.targetPath, 'Target path', true);
        if (sourcePath === targetPath || targetPath.startsWith(`${sourcePath}${path.sep}`)) throw new Error('A directory cannot be placed inside itself.');
        if (!fs.existsSync(path.dirname(targetPath))) throw new Error('Target folder does not exist.');
        const overwrite = params.overwrite === true;
        if (operation === 'move') {
          let backupPath: string | null = null;
          let retainBackup = false;
          if (fs.existsSync(targetPath)) {
            if (!overwrite) return { success: false, error: 'Target already exists.' };
            backupPath = createSiblingTemporaryPath(targetPath, 'backup');
            fs.renameSync(targetPath, backupPath);
          }
          try {
            fs.renameSync(sourcePath, targetPath);
          } catch (error) {
            retainBackup = !restoreReplacedTarget(targetPath, backupPath);
            throw error;
          } finally {
            if (!retainBackup && backupPath && fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });
          }
        } else {
          const temporaryTargetPath = createSiblingTemporaryPath(targetPath, 'copy');
          try {
            fs.cpSync(sourcePath, temporaryTargetPath, { recursive: true, errorOnExist: true });
            publishReplacement(temporaryTargetPath, targetPath, overwrite);
          } finally {
            if (fs.existsSync(temporaryTargetPath)) fs.rmSync(temporaryTargetPath, { recursive: true, force: true });
          }
        }
        return { success: true, targetPath: String(params.targetPath) };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };
  ipcMain.handle(IpcChannel.GitMoveWorkingDirectoryEntry, mutateWorkingDirectory('move'));
  ipcMain.handle(IpcChannel.GitCopyWorkingDirectoryEntry, mutateWorkingDirectory('copy'));
  ipcMain.handle(IpcChannel.GitDeleteWorkingDirectoryEntry, async (_event: unknown, filePath: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      fs.rmSync(workingDirectoryPath(repoPath, filePath, 'File path'), { recursive: true, force: false });
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
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

  ipcMain.handle(IpcChannel.GitDeleteRepoFile, async (_event: unknown, filePath: unknown, requestedRepoPath?: unknown) => {
    try {
      const repositoryFilePath = asRepositoryFilePath(filePath);
      if (repositoryFilePath.length === 0) {
        return { success: false, error: 'File path is required' };
      }

      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      await gitService.files.deleteRepoFileAtPath(repoPath, repositoryFilePath);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitOpenRepositoryPath, async (_event: unknown, params: { path?: unknown; action?: unknown; repoPath?: unknown } = {}) => {
    try {
      const action = String(params.action || '');
      if (!REPOSITORY_PATH_OPEN_ACTIONS.has(action)) {
        throw new Error('Invalid repository path action.');
      }

      const relativePath = asRepositoryFilePath(params.path);
      let repoPath: string;
      try {
        repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
      } catch (authorizationError: unknown) {
        // Opening an already registered repository folder must not switch
        // the active workspace. Limit that inactive-repository exception to
        // the repository root; individual files remain active-repository
        // only and therefore cannot become a general filesystem capability.
        const requestedRepoPath = String(params.repoPath || '').trim();
        const storedRepoPath =
          action === 'open' && relativePath.length === 0 && requestedRepoPath
            ? readStoredRepoPaths().find((storedPath) => repositoryPathKey(storedPath) === repositoryPathKey(requestedRepoPath))
            : undefined;
        if (!storedRepoPath) throw authorizationError;
        repoPath = storedRepoPath;
      }
      const targetPath = relativePath ? resolveExistingRepositoryPath(repoPath, relativePath, 'Repository path') : fs.realpathSync(repoPath);

      if (action === 'reveal') {
        shell.showItemInFolder(targetPath);
        return { success: true };
      }

      if (action === 'openWith') {
        await openWithSystemChooser(targetPath);
        return { success: true };
      }

      const openError = await shell.openPath(targetPath);
      if (openError) throw new Error(openError);
      return { success: true };
    } catch (error: unknown) {
      // A file from historical commit details can legitimately be absent in
      // the current checkout. Revealing its nearest existing parent still
      // gives the user useful filesystem context without ever resolving an
      // arbitrary renderer path outside the active repository.
      if (String(params.action || '') === 'reveal' && asRepositoryFilePath(params.path)) {
        try {
          const repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
          const candidatePath = resolveRepositoryPathForCreate(repoPath, asRepositoryFilePath(params.path), 'Repository path');
          const openError = await shell.openPath(findExistingParentPath(path.dirname(candidatePath)));
          if (!openError) return { success: true };
        } catch {
          // Return the original error below so traversal or authorization
          // failures are never masked by the fallback.
        }
      }
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
      // The Git command crossed an asynchronous boundary. Authorize again
      // before any filesystem read or write so a repository switch cannot
      // apply this operation to a repository the user has left.
      requireActiveRepositoryPath(selectedRepo, gitService.getRepoPath());
      const { targetPath: gitignorePath, content: existing, mode } = readIgnoreFileSafely(repoRoot);
      const existingRules = new Set(existing.split(/\r?\n/).filter((line) => line.length > 0));

      if (existingRules.has(normalizedPattern)) {
        return { success: true, added: false, pattern: normalizedPattern };
      }

      const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith('\r\n');
      const nextContent = `${existing}${needsLeadingNewline ? '\n' : ''}${normalizedPattern}\n`;
      replaceIgnoreFileAtomically(gitignorePath, nextContent, mode);
      return { success: true, added: true, pattern: normalizedPattern };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
