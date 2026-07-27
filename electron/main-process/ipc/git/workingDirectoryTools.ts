import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../../../GitService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { createZipArchive, type ZipArchiveEntry } from '../../zipArchive';
import { createWorkingDirectoryEntrySafely } from './workingDirectoryFileCreation';

type WorkingDirectoryPathResolver = (repoPath: string, value: unknown, label: string, allowMissing?: boolean) => string;
type RegisterWorkingDirectoryToolsHandlersDeps = {
  gitService: GitService;
  workingDirectoryPath: WorkingDirectoryPathResolver;
};

type ResolvedMove = {
  sourcePath: string;
  targetPath: string;
  temporaryPath: string;
  sourceIsDirectory: boolean;
};

const asPath = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const pathKey = (value: string): string => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
const isSameOrWithin = (candidate: string, parent: string): boolean => {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const temporarySibling = (value: string, purpose: string): string =>
  path.join(path.dirname(value), `.${path.basename(value)}.ogc-${purpose}-${process.pid}-${randomUUID()}`);

const removeCreatedFolders = (createdFolders: string[]): void => {
  for (const folderPath of [...createdFolders].reverse()) {
    try {
      fs.rmdirSync(folderPath);
    } catch {
      // A non-empty folder must never be removed during rollback.
    }
  }
};

const rollbackMoves = (moves: ResolvedMove[], publishedCount: number): void => {
  for (let index = publishedCount - 1; index >= 0; index -= 1) {
    const move = moves[index];
    if (fs.existsSync(move.targetPath) && !fs.existsSync(move.sourcePath)) fs.renameSync(move.targetPath, move.sourcePath);
  }
  for (let index = moves.length - 1; index >= publishedCount; index -= 1) {
    const move = moves[index];
    if (fs.existsSync(move.temporaryPath) && !fs.existsSync(move.sourcePath)) fs.renameSync(move.temporaryPath, move.sourcePath);
  }
};

const applyMoves = (repoPath: string, rawMoves: unknown, createParentFolders: boolean, workingDirectoryPath: WorkingDirectoryPathResolver): void => {
  if (!Array.isArray(rawMoves) || rawMoves.length === 0) throw new Error('At least one move is required.');
  if (rawMoves.length > 5000) throw new Error('Too many entries were selected.');
  const moves = rawMoves.map((rawMove, index) => {
    const candidate = rawMove && typeof rawMove === 'object' ? (rawMove as Record<string, unknown>) : {};
    const sourcePath = workingDirectoryPath(repoPath, candidate.sourcePath, `Source path ${index + 1}`);
    const targetPath = workingDirectoryPath(repoPath, candidate.targetPath, `Target path ${index + 1}`, true);
    const sourceStats = fs.lstatSync(sourcePath);
    if (sourceStats.isSymbolicLink()) throw new Error('Symbolic links cannot be moved with batch tools.');
    return {
      sourcePath,
      targetPath,
      sourceIsDirectory: sourceStats.isDirectory(),
      temporaryPath: temporarySibling(sourcePath, 'move'),
    };
  });

  const sourceKeys = new Set<string>();
  const targetKeys = new Set<string>();
  for (const move of moves) {
    const source = pathKey(move.sourcePath);
    const target = pathKey(move.targetPath);
    if (sourceKeys.has(source)) throw new Error('A source path appears more than once.');
    if (targetKeys.has(target)) throw new Error('Two entries would receive the same target path.');
    sourceKeys.add(source);
    targetKeys.add(target);
    if (move.sourceIsDirectory && isSameOrWithin(move.targetPath, move.sourcePath)) throw new Error('A folder cannot be moved inside itself.');
  }
  for (let left = 0; left < moves.length; left += 1) {
    for (let right = left + 1; right < moves.length; right += 1) {
      if (isSameOrWithin(moves[left].sourcePath, moves[right].sourcePath) || isSameOrWithin(moves[right].sourcePath, moves[left].sourcePath)) {
        throw new Error('Select either a folder or entries inside it, not both.');
      }
    }
  }
  for (const move of moves) {
    if (fs.existsSync(move.targetPath) && !sourceKeys.has(pathKey(move.targetPath)))
      throw new Error(`Target already exists: ${path.basename(move.targetPath)}`);
    if (moves.some((candidate) => candidate.sourceIsDirectory && isSameOrWithin(path.dirname(move.targetPath), candidate.sourcePath))) {
      throw new Error('A target folder cannot be moved as part of the same operation.');
    }
  }

  const createdFolders: string[] = [];
  try {
    for (const parentFolder of [...new Set(moves.map((move) => path.dirname(move.targetPath)))]) {
      if (fs.existsSync(parentFolder)) {
        if (!fs.statSync(parentFolder).isDirectory()) throw new Error('A target parent is not a folder.');
        continue;
      }
      if (!createParentFolders || !fs.existsSync(path.dirname(parentFolder))) throw new Error('Target folder does not exist.');
      createWorkingDirectoryEntrySafely(parentFolder, 'folder');
      createdFolders.push(parentFolder);
    }

    let stagedCount = 0;
    try {
      for (const move of moves) {
        fs.renameSync(move.sourcePath, move.temporaryPath);
        stagedCount += 1;
      }
    } catch (error) {
      rollbackMoves(moves.slice(0, stagedCount), 0);
      throw error;
    }

    let publishedCount = 0;
    try {
      for (const move of moves) {
        fs.renameSync(move.temporaryPath, move.targetPath);
        publishedCount += 1;
      }
    } catch (error) {
      rollbackMoves(moves, publishedCount);
      throw error;
    }
  } catch (error) {
    removeCreatedFolders(createdFolders);
    throw error;
  }
};

const scanEmptyFolder = (folderPath: string, relativePath: string, includeSelf: boolean): { empty: boolean; paths: string[] } => {
  const nestedPaths: string[] = [];
  let containsContent = false;
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === '.git') {
      containsContent = true;
      continue;
    }
    const childPath = path.join(folderPath, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      containsContent = true;
      continue;
    }
    const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const child = scanEmptyFolder(childPath, childRelativePath, true);
    if (!child.empty) containsContent = true;
    nestedPaths.push(...child.paths);
  }
  if (!containsContent) return { empty: true, paths: includeSelf ? [relativePath] : nestedPaths };
  return { empty: false, paths: nestedPaths };
};

const deleteEmptyFolderTree = (folderPath: string): void => {
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    const childPath = path.join(folderPath, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.toLowerCase() === '.git') {
      throw new Error(`Folder is no longer empty: ${path.basename(folderPath)}`);
    }
    deleteEmptyFolderTree(childPath);
  }
  fs.rmdirSync(folderPath);
};

const commonParent = (paths: string[]): string => {
  let current = path.dirname(paths[0]);
  while (!paths.every((candidate) => isSameOrWithin(candidate, current))) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
};

const collectZipEntries = (sourcePath: string, archivePath: string, entries: ZipArchiveEntry[]): void => {
  const stats = fs.lstatSync(sourcePath);
  if (stats.isSymbolicLink()) throw new Error('Symbolic links cannot be added to an archive.');
  if (stats.isFile()) {
    entries.push({ sourcePath, archivePath, kind: 'file', modifiedAt: stats.mtime });
    return;
  }
  if (!stats.isDirectory()) throw new Error('Only files and folders can be archived.');
  entries.push({ sourcePath: null, archivePath, kind: 'directory', modifiedAt: stats.mtime });
  for (const item of fs.readdirSync(sourcePath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (item.name.toLowerCase() === '.git') continue;
    collectZipEntries(path.join(sourcePath, item.name), `${archivePath}/${item.name}`, entries);
  }
};

export function registerWorkingDirectoryToolsHandlers({ gitService, workingDirectoryPath }: RegisterWorkingDirectoryToolsHandlersDeps): void {
  ipcMain.handle(
    IpcChannel.GitApplyWorkingDirectoryMoves,
    async (_event: unknown, params: { moves?: unknown; createParentFolders?: unknown } = {}, requestedRepoPath?: unknown) => {
      try {
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        applyMoves(repoPath, params.moves, params.createParentFolders === true, workingDirectoryPath);
        return { success: true };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitListWorkingDirectoryFolders, async (_event: unknown, requestedRepoPath?: unknown, rawParentPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const relativeParentPath = asPath(rawParentPath);
      const folderPath = relativeParentPath ? workingDirectoryPath(repoPath, relativeParentPath, 'Parent folder') : fs.realpathSync(repoPath);
      if (!fs.statSync(folderPath).isDirectory()) throw new Error('Parent path is not a folder.');
      const folders = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((entry) => entry.name.toLowerCase() !== '.git' && entry.isDirectory() && !entry.isSymbolicLink())
        .map((entry) => (relativeParentPath ? `${relativeParentPath}/${entry.name}` : entry.name))
        .sort((left, right) => left.localeCompare(right));
      return { success: true, data: folders };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitFindEmptyWorkingDirectoryFolders, async (_event: unknown, rawFolderPaths: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      if (!Array.isArray(rawFolderPaths)) throw new Error('Folder paths must be an array.');
      const folderPaths = rawFolderPaths.map(asPath);
      const results =
        folderPaths.length === 0
          ? scanEmptyFolder(fs.realpathSync(repoPath), '', false).paths
          : folderPaths.flatMap((relativePath) => {
              const folderPath = workingDirectoryPath(repoPath, relativePath, 'Folder path');
              if (!fs.statSync(folderPath).isDirectory()) throw new Error('Only folders can be checked for emptiness.');
              return scanEmptyFolder(folderPath, relativePath, true).paths;
            });
      return { success: true, data: [...new Set(results)].filter(Boolean) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitDeleteEmptyWorkingDirectoryFolders, async (_event: unknown, rawFolderPaths: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      if (!Array.isArray(rawFolderPaths) || rawFolderPaths.length === 0) throw new Error('At least one empty folder is required.');
      const paths = rawFolderPaths.map((relativePath) => workingDirectoryPath(repoPath, relativePath, 'Folder path'));
      for (const folderPath of paths.sort((left, right) => right.length - left.length)) deleteEmptyFolderTree(folderPath);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    IpcChannel.GitCreateWorkingDirectoryArchive,
    async (_event: unknown, params: { sourcePaths?: unknown; targetPath?: unknown } = {}, requestedRepoPath?: unknown) => {
      let temporaryPath: string | null = null;
      try {
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        if (!Array.isArray(params.sourcePaths) || params.sourcePaths.length === 0) throw new Error('At least one archive source is required.');
        const sourcePaths = params.sourcePaths.map((sourcePath) => workingDirectoryPath(repoPath, sourcePath, 'Archive source'));
        const targetPath = workingDirectoryPath(repoPath, params.targetPath, 'Archive path', true);
        if (fs.existsSync(targetPath)) throw new Error('Archive target already exists.');
        if (!fs.existsSync(path.dirname(targetPath))) throw new Error('Archive target folder does not exist.');
        if (sourcePaths.some((sourcePath) => path.basename(sourcePath).toLowerCase() === '.git')) throw new Error('Git metadata cannot be archived.');
        if (sourcePaths.some((sourcePath) => fs.statSync(sourcePath).isDirectory() && isSameOrWithin(targetPath, sourcePath))) {
          throw new Error('The archive cannot be created inside a selected folder.');
        }
        for (let left = 0; left < sourcePaths.length; left += 1) {
          for (let right = left + 1; right < sourcePaths.length; right += 1) {
            if (isSameOrWithin(sourcePaths[left], sourcePaths[right]) || isSameOrWithin(sourcePaths[right], sourcePaths[left])) {
              throw new Error('Select either a folder or entries inside it, not both.');
            }
          }
        }
        const basePath = commonParent(sourcePaths);
        const entries: ZipArchiveEntry[] = [];
        for (const sourcePath of sourcePaths) collectZipEntries(sourcePath, path.relative(basePath, sourcePath).replace(/\\/g, '/'), entries);
        temporaryPath = temporarySibling(targetPath, 'archive');
        await createZipArchive(temporaryPath, entries);
        requireActiveRepositoryPath(repoPath, gitService.getRepoPath());
        fs.renameSync(temporaryPath, targetPath);
        temporaryPath = null;
        return { success: true, targetPath: asPath(params.targetPath) };
      } catch (error: unknown) {
        if (temporaryPath && fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}
