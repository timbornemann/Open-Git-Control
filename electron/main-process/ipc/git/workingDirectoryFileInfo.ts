import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { GitService } from '../../../GitService';
import { toLiteralPathspec } from '../../../git/RepositoryPathSafety';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { GitFileHistoryEntryDto } from '../../../../src/types/git';

type WorkingDirectoryPathResolver = (repoPath: string, value: unknown, label: string) => string;

type RegisterWorkingDirectoryFileInfoHandlerDeps = {
  gitService: GitService;
  workingDirectoryPath: WorkingDirectoryPathResolver;
};

const FILE_HISTORY_FORMAT = '%H%x1f%h%x1f%an%x1f%aI%x1f%s%x00';

const asRepositoryFilePath = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

const parseFileHistoryEntries = (raw: string): GitFileHistoryEntryDto[] =>
  raw
    .split('\0')
    .map((record) => record.split('\x1f'))
    .filter((fields) => fields.length >= 5 && fields[0] && fields[1])
    .map(([hash, abbrevHash, author, date, subject]) => ({ hash, abbrevHash, author, date, subject }));

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const calculateHashes = (filePath: string): Promise<{ sha256: string; sha1: string; md5: string }> =>
  new Promise((resolve, reject) => {
    const hashes = {
      sha256: createHash('sha256'),
      sha1: createHash('sha1'),
      md5: createHash('md5'),
    };
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      hashes.sha256.update(chunk);
      hashes.sha1.update(chunk);
      hashes.md5.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () =>
      resolve({
        sha256: hashes.sha256.digest('hex'),
        sha1: hashes.sha1.digest('hex'),
        md5: hashes.md5.digest('hex'),
      }),
    );
  });

const isUnbornHeadError = (error: unknown): boolean =>
  /needed a single revision|does not have any commits yet|unknown revision or path not in the working tree|ambiguous argument ['"]?HEAD['"]?: unknown revision/i.test(
    getErrorMessage(error),
  );

const getWorkingDirectoryGitStatus = (statusRaw: string, tracked: boolean) => {
  const statusCodes = statusRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(0, 2));
  const ignored = statusCodes.some((code) => code === '!!');
  const untracked = statusCodes.some((code) => code === '??');

  return {
    tracked: tracked && !ignored && !untracked,
    ignored,
    staged: statusCodes.some((code) => code[0] !== ' ' && code[0] !== '?' && code[0] !== '!'),
    modified: statusCodes.some((code) => code[1] !== ' ' && code[1] !== '?' && code[1] !== '!'),
    conflicted: statusCodes.some((code) => code.includes('U') || code === 'AA' || code === 'DD'),
  };
};

export function registerWorkingDirectoryFileInfoHandler({ gitService, workingDirectoryPath }: RegisterWorkingDirectoryFileInfoHandlerDeps): void {
  ipcMain.handle(IpcChannel.GitGetWorkingDirectoryFileInfo, async (_event: unknown, filePath: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const relativePath = asRepositoryFilePath(filePath);
      const resolvedPath = workingDirectoryPath(repoPath, relativePath, 'File path');
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) throw new Error('Target path is not a file.');

      const literalPathspec = toLiteralPathspec(relativePath, 'File path');
      const [trackedResult, statusResult, historyResult, hashesResult] = await Promise.allSettled([
        gitService.runCommandAtPath(repoPath, ['ls-files', '--stage', '--', literalPathspec]),
        gitService.runCommandAtPath(repoPath, ['status', '--porcelain=v1', '--ignored', '--untracked-files=all', '--', literalPathspec]),
        gitService.runCommandAtPath(repoPath, ['log', '--follow', '--date=iso-strict', `--pretty=format:${FILE_HISTORY_FORMAT}`, '--', literalPathspec]),
        calculateHashes(resolvedPath),
      ]);

      const tracked = trackedResult.status === 'fulfilled' && trackedResult.value.trim().length > 0;
      const statusRaw = statusResult.status === 'fulfilled' ? statusResult.value : '';
      const history = historyResult.status === 'fulfilled' ? parseFileHistoryEntries(historyResult.value) : [];
      const errors = [
        trackedResult.status === 'rejected' ? getErrorMessage(trackedResult.reason) : null,
        statusResult.status === 'rejected' ? getErrorMessage(statusResult.reason) : null,
        historyResult.status === 'rejected' && !isUnbornHeadError(historyResult.reason) ? getErrorMessage(historyResult.reason) : null,
      ].filter((error): error is string => Boolean(error));

      return {
        success: true,
        data: {
          path: relativePath,
          name: path.basename(resolvedPath),
          extension: path.extname(resolvedPath).slice(1) || null,
          bytes: stat.size,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          accessedAt: stat.atime.toISOString(),
          readOnly: (stat.mode & 0o222) === 0,
          hashes: hashesResult.status === 'fulfilled' ? hashesResult.value : null,
          ...(hashesResult.status === 'rejected' ? { hashError: getErrorMessage(hashesResult.reason) } : {}),
          git: {
            ...getWorkingDirectoryGitStatus(statusRaw, tracked),
            historyCount: history.length,
            firstCommit: history.at(-1) || null,
            latestCommit: history[0] || null,
            ...(errors.length > 0 ? { error: errors.join('\n') } : {}),
          },
        },
      };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) };
    }
  });
}
