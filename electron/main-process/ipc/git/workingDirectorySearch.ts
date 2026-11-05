import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import type {
  WorkingDirectoryReplaceRequestDto,
  WorkingDirectoryReplaceResultDto,
  WorkingDirectorySearchFileDto,
  WorkingDirectorySearchRequestDto,
  WorkingDirectorySearchResultDto,
} from '../../../../src/shared/ipc/contracts/git';
import { IpcChannel } from '../../../../src/types/ipcContract';
import {
  asSearchQuery,
  asReplacement,
  fileName,
  findLineMatches,
  searchFileNames,
  replaceAllLiteral,
  replaceTarget,
} from '../../../../src/shared/workingDirectorySearch';

type RegisterWorkingDirectorySearchHandlersDeps = {
  gitService: GitService;
};

const MAX_CANDIDATE_FILES = 20_000;
const MAX_CONTENT_RESULTS = 1_000;
const MAX_MATCHES_PER_FILE = 200;
const MAX_REPLACE_FILES = 1_000;
const MAX_REPLACE_SOURCE_CHARACTERS = 50 * 1024 * 1024;

const pathKey = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);

const listCandidateFiles = async (gitService: GitService, repoPath: string): Promise<{ paths: string[]; truncated: boolean }> => {
  const output = await gitService.runCommandAtPath(repoPath, ['-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const allPaths = output
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return { paths: allPaths.slice(0, MAX_CANDIDATE_FILES), truncated: allPaths.length > MAX_CANDIDATE_FILES };
};

const searchContents = async (
  gitService: GitService,
  repoPath: string,
  paths: string[],
  query: string,
  caseSensitive: boolean,
  candidatesTruncated: boolean,
): Promise<WorkingDirectorySearchResultDto> => {
  const files: WorkingDirectorySearchFileDto[] = [];
  let totalMatches = 0;
  let displayedMatches = 0;
  let scannedFiles = 0;
  let truncated = candidatesTruncated;
  for (const filePath of paths) {
    try {
      const text = await gitService.readRepoFileAtPath(repoPath, filePath);
      scannedFiles += 1;
      const displayLimit = Math.min(MAX_MATCHES_PER_FILE, Math.max(0, MAX_CONTENT_RESULTS - displayedMatches));
      const result = findLineMatches(text, query, caseSensitive, displayLimit);
      totalMatches += result.total;
      if (result.matches.length > 0) {
        files.push({ path: filePath, name: fileName(filePath), matches: result.matches });
        displayedMatches += result.matches.length;
      }
      if (result.total > result.matches.length) truncated = true;
    } catch {
      // Binary, oversized, inaccessible and concurrently removed files are not searchable text.
    }
  }
  return { files, totalMatches, scannedFiles, truncated };
};

const replaceMatches = async (
  gitService: GitService,
  repoPath: string,
  request: WorkingDirectoryReplaceRequestDto,
): Promise<WorkingDirectoryReplaceResultDto> => {
  const query = asSearchQuery(request.query);
  const replacement = asReplacement(request.replacement);
  const caseSensitive = request.caseSensitive === true;
  const allCandidates = request.all === true ? await listCandidateFiles(gitService, repoPath) : null;
  if (allCandidates?.truncated) throw new Error(`Replace all is limited to ${MAX_CANDIDATE_FILES} repository files.`);
  const targets = request.target ? [request.target.path] : allCandidates?.paths || request.paths;
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('At least one result file is required.');
  const uniquePaths = [...new Map(targets.map((filePath) => [pathKey(String(filePath)), String(filePath)])).values()];
  if (!allCandidates && uniquePaths.length > MAX_REPLACE_FILES) {
    throw new Error(`Cannot replace in more than ${MAX_REPLACE_FILES} files at once.`);
  }
  const prepared: Array<{ filePath: string; original: string; replacement: string; count: number }> = [];
  let sourceCharacters = 0;
  for (const filePath of uniquePaths) {
    let original: string;
    try {
      original = await gitService.readRepoFileAtPath(repoPath, filePath);
    } catch (error) {
      if (allCandidates) continue;
      throw error;
    }
    const result = request.target
      ? replaceTarget(original, query, replacement, caseSensitive, request.target.line, request.target.column)
      : replaceAllLiteral(original, query, replacement, caseSensitive);
    if (result.count > 0) {
      if (prepared.length >= MAX_REPLACE_FILES) throw new Error(`Cannot replace in more than ${MAX_REPLACE_FILES} files at once.`);
      sourceCharacters += original.length;
      if (sourceCharacters > MAX_REPLACE_SOURCE_CHARACTERS) {
        throw new Error('The matching files are too large to replace safely in one operation.');
      }
      prepared.push({ filePath, original, replacement: result.text, count: result.count });
    }
  }
  const written: typeof prepared = [];
  try {
    for (const item of prepared) {
      requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.GitReplaceWorkingDirectory);
      await gitService.writeRepoFileAtPath(repoPath, item.filePath, item.replacement);
      written.push(item);
    }
  } catch (error: unknown) {
    const rollbackErrors: string[] = [];
    for (const item of written.reverse()) {
      try {
        await gitService.writeRepoFileAtPath(repoPath, item.filePath, item.original);
      } catch (rollbackError: unknown) {
        rollbackErrors.push(`${item.filePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(rollbackErrors.length > 0 ? `${message} Rollback failed for ${rollbackErrors.join(', ')}` : message);
  }
  return {
    replacements: prepared.reduce((sum, item) => sum + item.count, 0),
    paths: prepared.map((item) => item.filePath),
  };
};

export function registerWorkingDirectorySearchHandlers({ gitService }: RegisterWorkingDirectorySearchHandlersDeps): void {
  ipcMain.handle(IpcChannel.GitSearchWorkingDirectory, async (_event: unknown, rawRequest: WorkingDirectorySearchRequestDto, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitSearchWorkingDirectory);
      const query = asSearchQuery(rawRequest?.query);
      const mode = rawRequest?.mode;
      if (mode !== 'filename' && mode !== 'content') throw new Error('Invalid search mode.');
      const caseSensitive = rawRequest.caseSensitive === true;
      const candidates = await listCandidateFiles(gitService, repoPath);
      const data =
        mode === 'filename'
          ? searchFileNames(candidates.paths, query, caseSensitive, candidates.truncated)
          : await searchContents(gitService, repoPath, candidates.paths, query, caseSensitive, candidates.truncated);
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitReplaceWorkingDirectory, async (_event: unknown, request: WorkingDirectoryReplaceRequestDto, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitReplaceWorkingDirectory);
      return { success: true, data: await replaceMatches(gitService, repoPath, request || ({} as WorkingDirectoryReplaceRequestDto)) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
