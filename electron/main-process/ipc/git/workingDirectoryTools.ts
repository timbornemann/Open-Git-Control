import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../../../GitService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { createZipArchive, type ZipArchiveEntry } from '../../zipArchive';
import { assertWindowsWorkingDirectoryAccess, createWorkingDirectoryEntrySafely } from './workingDirectoryFileCreation';
import { registerWorkingDirectorySearchHandlers } from './workingDirectorySearch';
import { assertIndependentPaths, pathExists, pathKey } from './workingDirectoryAsyncFs';
import { withWorkingDirectoryWrite } from './workingDirectoryWrite';

type WorkingDirectoryPathResolver = (repoPath: string, value: unknown, label: string, allowMissing?: boolean) => string | Promise<string>;
type RegisterWorkingDirectoryToolsHandlersDeps = {
  gitService: GitService;
  workingDirectoryPath: WorkingDirectoryPathResolver;
  ensureWriteAllowed?: (repoPath: string) => void;
};

type ResolvedMove = {
  sourcePath: string;
  targetPath: string;
  temporaryPath: string;
  sourceIsDirectory: boolean;
};

const asPath = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const isSameOrWithin = (candidate: string, parent: string): boolean => {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const temporarySibling = (value: string, purpose: string): string =>
  path.join(path.dirname(value), `.${path.basename(value)}.ogc-${purpose}-${process.pid}-${randomUUID()}`);

const removeCreatedFolders = async (createdFolders: string[]): Promise<void> => {
  for (const folderPath of [...createdFolders].reverse()) {
    try {
      await fs.promises.rmdir(folderPath);
    } catch {
      // A non-empty folder must never be removed during rollback.
    }
  }
};

const rollbackMoves = async (moves: ResolvedMove[], publishedCount: number): Promise<void> => {
  for (let index = publishedCount - 1; index >= 0; index -= 1) {
    const move = moves[index];
    if ((await pathExists(move.targetPath)) && !(await pathExists(move.sourcePath))) await fs.promises.rename(move.targetPath, move.sourcePath);
  }
  for (let index = moves.length - 1; index >= publishedCount; index -= 1) {
    const move = moves[index];
    if ((await pathExists(move.temporaryPath)) && !(await pathExists(move.sourcePath))) await fs.promises.rename(move.temporaryPath, move.sourcePath);
  }
};

const applyMoves = async (
  repoPath: string,
  rawMoves: unknown,
  createParentFolders: boolean,
  workingDirectoryPath: WorkingDirectoryPathResolver,
  ensureContext: () => void,
): Promise<void> => {
  if (!Array.isArray(rawMoves) || rawMoves.length === 0) throw new Error('At least one move is required.');
  if (rawMoves.length > 5000) throw new Error('Too many entries were selected.');
  const moves: ResolvedMove[] = [];
  for (const [index, rawMove] of rawMoves.entries()) {
    const candidate = rawMove && typeof rawMove === 'object' ? (rawMove as Record<string, unknown>) : {};
    const sourcePath = await workingDirectoryPath(repoPath, candidate.sourcePath, `Source path ${index + 1}`);
    const targetPath = await workingDirectoryPath(repoPath, candidate.targetPath, `Target path ${index + 1}`, true);
    const sourceStats = await fs.promises.lstat(sourcePath);
    if (sourceStats.isSymbolicLink()) throw new Error('Symbolic links cannot be moved with batch tools.');
    await assertWindowsWorkingDirectoryAccess(sourcePath);
    moves.push({
      sourcePath,
      targetPath,
      sourceIsDirectory: sourceStats.isDirectory(),
      temporaryPath: temporarySibling(sourcePath, 'move'),
    });
  }

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
  assertIndependentPaths(moves.map((move) => move.sourcePath));
  const movedDirectories = new Set(moves.filter((move) => move.sourceIsDirectory).map((move) => pathKey(move.sourcePath)));
  for (const move of moves) {
    if ((await pathExists(move.targetPath)) && !sourceKeys.has(pathKey(move.targetPath)))
      throw new Error(`Target already exists: ${path.basename(move.targetPath)}`);
    let parent = path.dirname(move.targetPath);
    while (true) {
      if (movedDirectories.has(pathKey(parent))) throw new Error('A target folder cannot be moved as part of the same operation.');
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }

  const createdFolders: string[] = [];
  try {
    for (const parentFolder of [...new Set(moves.map((move) => path.dirname(move.targetPath)))]) {
      if (await pathExists(parentFolder)) {
        if (!(await fs.promises.stat(parentFolder)).isDirectory()) throw new Error('A target parent is not a folder.');
        await assertWindowsWorkingDirectoryAccess(parentFolder);
        continue;
      }
      if (!createParentFolders || !(await pathExists(path.dirname(parentFolder)))) throw new Error('Target folder does not exist.');
      ensureContext();
      await createWorkingDirectoryEntrySafely(parentFolder, 'folder');
      createdFolders.push(parentFolder);
    }

    let stagedCount = 0;
    try {
      for (const move of moves) {
        ensureContext();
        await fs.promises.rename(move.sourcePath, move.temporaryPath);
        stagedCount += 1;
      }
    } catch (error) {
      await rollbackMoves(moves.slice(0, stagedCount), 0);
      throw error;
    }

    let publishedCount = 0;
    try {
      for (const move of moves) {
        ensureContext();
        await fs.promises.rename(move.temporaryPath, move.targetPath);
        publishedCount += 1;
        await assertWindowsWorkingDirectoryAccess(move.targetPath);
      }
    } catch (error) {
      await rollbackMoves(moves, publishedCount);
      throw error;
    }
  } catch (error) {
    await removeCreatedFolders(createdFolders);
    throw error;
  }
};

const scanEmptyFolder = async (folderPath: string, relativePath: string, includeSelf: boolean): Promise<{ empty: boolean; paths: string[] }> => {
  const nestedPaths: string[] = [];
  let containsContent = false;
  if ((await fs.promises.lstat(folderPath)).isSymbolicLink()) throw new Error('Symbolic links cannot be scanned as folders.');
  for (const entry of await fs.promises.readdir(folderPath, { withFileTypes: true })) {
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
    const child = await scanEmptyFolder(childPath, childRelativePath, true);
    if (!child.empty) containsContent = true;
    nestedPaths.push(...child.paths);
  }
  if (!containsContent) return { empty: true, paths: includeSelf ? [relativePath] : nestedPaths };
  return { empty: false, paths: nestedPaths };
};

const deleteEmptyFolderTree = async (folderPath: string, ensureContext: () => void): Promise<void> => {
  if ((await fs.promises.lstat(folderPath)).isSymbolicLink()) throw new Error('Symbolic links cannot be deleted as empty folders.');
  for (const entry of await fs.promises.readdir(folderPath, { withFileTypes: true })) {
    const childPath = path.join(folderPath, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.toLowerCase() === '.git') {
      throw new Error(`Folder is no longer empty: ${path.basename(folderPath)}`);
    }
    await deleteEmptyFolderTree(childPath, ensureContext);
  }
  ensureContext();
  await fs.promises.rmdir(folderPath);
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

const collectZipEntries = async (sourcePath: string, archivePath: string, entries: ZipArchiveEntry[]): Promise<void> => {
  const stats = await fs.promises.lstat(sourcePath);
  if (stats.isSymbolicLink()) throw new Error('Symbolic links cannot be added to an archive.');
  if (stats.isFile()) {
    entries.push({ sourcePath, archivePath, kind: 'file', modifiedAt: stats.mtime });
    if (entries.length > 65535) throw new Error('The selection contains too many files for a ZIP archive.');
    return;
  }
  if (!stats.isDirectory()) throw new Error('Only files and folders can be archived.');
  entries.push({ sourcePath: null, archivePath, kind: 'directory', modifiedAt: stats.mtime });
  if (entries.length > 65535) throw new Error('The selection contains too many files for a ZIP archive.');
  for (const item of (await fs.promises.readdir(sourcePath, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (item.name.toLowerCase() === '.git') continue;
    await collectZipEntries(path.join(sourcePath, item.name), `${archivePath}/${item.name}`, entries);
  }
};

export function registerWorkingDirectoryToolsHandlers({
  gitService,
  workingDirectoryPath,
  ensureWriteAllowed = () => {},
}: RegisterWorkingDirectoryToolsHandlersDeps): void {
  registerWorkingDirectorySearchHandlers({ gitService });
  ipcMain.handle(
    IpcChannel.GitApplyWorkingDirectoryMoves,
    async (_event: unknown, params: { moves?: unknown; createParentFolders?: unknown } = {}, requestedRepoPath?: unknown) => {
      try {
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitApplyWorkingDirectoryMoves);
        ensureWriteAllowed(repoPath);
        await withWorkingDirectoryWrite(gitService, repoPath, IpcChannel.GitApplyWorkingDirectoryMoves, ensureWriteAllowed, (ensureContext) =>
          applyMoves(repoPath, params.moves, params.createParentFolders === true, workingDirectoryPath, ensureContext),
        );
        return { success: true };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitListWorkingDirectoryFolders, async (_event: unknown, requestedRepoPath?: unknown, rawParentPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitListWorkingDirectoryFolders);
      const relativeParentPath = asPath(rawParentPath);
      const folderPath = relativeParentPath ? await workingDirectoryPath(repoPath, relativeParentPath, 'Parent folder') : await fs.promises.realpath(repoPath);
      if (!(await fs.promises.stat(folderPath)).isDirectory()) throw new Error('Parent path is not a folder.');
      const folders: string[] = [];
      for (const entry of await fs.promises.readdir(folderPath, { withFileTypes: true })) {
        if (entry.name.toLowerCase() === '.git' || !entry.isDirectory() || entry.isSymbolicLink()) continue;
        try {
          await assertWindowsWorkingDirectoryAccess(path.join(folderPath, entry.name));
          folders.push(relativeParentPath ? `${relativeParentPath}/${entry.name}` : entry.name);
        } catch {
          // Inaccessible destinations cannot be offered as move targets.
        }
      }
      folders.sort((left, right) => left.localeCompare(right));
      return { success: true, data: folders };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitFindEmptyWorkingDirectoryFolders, async (_event: unknown, rawFolderPaths: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitFindEmptyWorkingDirectoryFolders);
      if (!Array.isArray(rawFolderPaths)) throw new Error('Folder paths must be an array.');
      const folderPaths = rawFolderPaths.map(asPath);
      const results: string[] = [];
      if (folderPaths.length === 0) results.push(...(await scanEmptyFolder(await fs.promises.realpath(repoPath), '', false)).paths);
      else
        for (const relativePath of folderPaths) {
          const folderPath = await workingDirectoryPath(repoPath, relativePath, 'Folder path');
          if (!(await fs.promises.stat(folderPath)).isDirectory()) throw new Error('Only folders can be checked for emptiness.');
          results.push(...(await scanEmptyFolder(folderPath, relativePath, true)).paths);
        }
      return { success: true, data: [...new Set(results)].filter(Boolean) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitDeleteEmptyWorkingDirectoryFolders, async (_event: unknown, rawFolderPaths: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitDeleteEmptyWorkingDirectoryFolders);
      ensureWriteAllowed(repoPath);
      if (!Array.isArray(rawFolderPaths) || rawFolderPaths.length === 0) throw new Error('At least one empty folder is required.');
      await withWorkingDirectoryWrite(gitService, repoPath, IpcChannel.GitDeleteEmptyWorkingDirectoryFolders, ensureWriteAllowed, async (ensureContext) => {
        const paths: string[] = [];
        for (const relativePath of rawFolderPaths) paths.push(await workingDirectoryPath(repoPath, relativePath, 'Folder path'));
        for (const folderPath of paths.sort((left, right) => right.length - left.length)) await deleteEmptyFolderTree(folderPath, ensureContext);
      });
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
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitCreateWorkingDirectoryArchive);
        ensureWriteAllowed(repoPath);
        return await withWorkingDirectoryWrite(gitService, repoPath, IpcChannel.GitCreateWorkingDirectoryArchive, ensureWriteAllowed, async (ensureContext) => {
          if (!Array.isArray(params.sourcePaths) || params.sourcePaths.length === 0) throw new Error('At least one archive source is required.');
          const sourcePaths: string[] = [];
          for (const sourcePath of params.sourcePaths) sourcePaths.push(await workingDirectoryPath(repoPath, sourcePath, 'Archive source'));
          const targetPath = await workingDirectoryPath(repoPath, params.targetPath, 'Archive path', true);
          if (await pathExists(targetPath)) throw new Error('Archive target already exists.');
          if (!(await pathExists(path.dirname(targetPath)))) throw new Error('Archive target folder does not exist.');
          if (sourcePaths.some((sourcePath) => path.basename(sourcePath).toLowerCase() === '.git')) throw new Error('Git metadata cannot be archived.');
          for (const sourcePath of sourcePaths) {
            if ((await fs.promises.stat(sourcePath)).isDirectory() && isSameOrWithin(targetPath, sourcePath))
              throw new Error('The archive cannot be created inside a selected folder.');
          }
          if (new Set(sourcePaths.map(pathKey)).size !== sourcePaths.length) throw new Error('Select each archive source only once.');
          assertIndependentPaths(sourcePaths);
          const basePath = commonParent(sourcePaths);
          const entries: ZipArchiveEntry[] = [];
          for (const sourcePath of sourcePaths) await collectZipEntries(sourcePath, path.relative(basePath, sourcePath).replace(/\\/g, '/'), entries);
          ensureContext();
          temporaryPath = temporarySibling(targetPath, 'archive');
          await createZipArchive(temporaryPath, entries);
          await workingDirectoryPath(repoPath, params.targetPath, 'Archive path', true);
          ensureContext();
          // Publishing must remain exclusive after the asynchronous ZIP work.
          // rename would replace a file created since the initial existence check.
          try {
            await fs.promises.link(temporaryPath, targetPath);
          } catch (publishError: unknown) {
            if ((publishError as NodeJS.ErrnoException).code === 'EEXIST') throw publishError;
            // FAT/exFAT and some network filesystems do not support hard links.
            await fs.promises.copyFile(temporaryPath, targetPath, fs.constants.COPYFILE_EXCL);
          }
          await fs.promises.unlink(temporaryPath);
          temporaryPath = null;
          return { success: true, targetPath: asPath(params.targetPath) };
        });
      } catch (error: unknown) {
        if (temporaryPath) await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}
