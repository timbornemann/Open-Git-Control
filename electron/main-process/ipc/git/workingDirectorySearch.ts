import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import type {
  WorkingDirectoryReplaceRequestDto,
  WorkingDirectoryReplaceResultDto,
  WorkingDirectorySearchFileDto,
  WorkingDirectorySearchMatchDto,
  WorkingDirectorySearchRequestDto,
  WorkingDirectorySearchResultDto,
} from '../../../../src/shared/ipc/contracts/git';
import { IpcChannel } from '../../../../src/types/ipcContract';

type RegisterWorkingDirectorySearchHandlersDeps = {
  gitService: GitService;
};

const MAX_QUERY_LENGTH = 1_000;
const MAX_REPLACEMENT_LENGTH = 100_000;
const MAX_CANDIDATE_FILES = 20_000;
const MAX_FILENAME_RESULTS = 500;
const MAX_CONTENT_RESULTS = 1_000;
const MAX_MATCHES_PER_FILE = 200;
const MAX_REPLACE_FILES = 1_000;
const MAX_REPLACE_SOURCE_CHARACTERS = 50 * 1024 * 1024;
const PREVIEW_CONTEXT = 70;

const asSearchQuery = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Search text is required.');
  if (value.length > MAX_QUERY_LENGTH) throw new Error(`Search text cannot exceed ${MAX_QUERY_LENGTH} characters.`);
  if (/[\r\n\0]/.test(value)) throw new Error('Search text must be a single line.');
  return value;
};

const asReplacement = (value: unknown): string => {
  const replacement = typeof value === 'string' ? value : String(value ?? '');
  if (replacement.length > MAX_REPLACEMENT_LENGTH) {
    throw new Error(`Replacement text cannot exceed ${MAX_REPLACEMENT_LENGTH} characters.`);
  }
  if (replacement.includes('\0')) throw new Error('Replacement text contains an invalid character.');
  return replacement;
};

const compareText = (value: string, caseSensitive: boolean): string => (caseSensitive ? value : value.toLowerCase());
const pathKey = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);
const fileName = (filePath: string): string => filePath.replace(/\\/g, '/').split('/').pop() || filePath;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createLiteralRegExp = (query: string, caseSensitive: boolean): RegExp => new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
const isLiteralMatch = (value: string, query: string, caseSensitive: boolean): boolean => {
  const expression = new RegExp(`^(?:${escapeRegExp(query)})$`, caseSensitive ? '' : 'i');
  return expression.test(value);
};

const listCandidateFiles = async (gitService: GitService, repoPath: string): Promise<{ paths: string[]; truncated: boolean }> => {
  const output = await gitService.runCommandAtPath(repoPath, ['-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const allPaths = output
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return { paths: allPaths.slice(0, MAX_CANDIDATE_FILES), truncated: allPaths.length > MAX_CANDIDATE_FILES };
};

const rankFileNameMatch = (filePath: string, query: string, caseSensitive: boolean): number => {
  const normalizedPath = compareText(filePath, caseSensitive);
  const normalizedName = compareText(fileName(filePath), caseSensitive);
  const normalizedQuery = compareText(query, caseSensitive);
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  return normalizedPath.includes(normalizedQuery) ? 3 : -1;
};

const createPreview = (
  lineText: string,
  matchIndex: number,
  queryLength: number,
): Pick<WorkingDirectorySearchMatchDto, 'preview' | 'previewMatchStart' | 'matchLength'> => {
  const start = Math.max(0, matchIndex - PREVIEW_CONTEXT);
  const end = Math.min(lineText.length, matchIndex + queryLength + PREVIEW_CONTEXT);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < lineText.length ? '…' : '';
  return {
    preview: `${prefix}${lineText.slice(start, end)}${suffix}`,
    previewMatchStart: prefix.length + matchIndex - start,
    matchLength: queryLength,
  };
};

const findLineMatches = (
  text: string,
  query: string,
  caseSensitive: boolean,
  displayLimit: number,
): { matches: WorkingDirectorySearchMatchDto[]; total: number } => {
  const matches: WorkingDirectorySearchMatchDto[] = [];
  let total = 0;
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    for (const match of lineText.matchAll(createLiteralRegExp(query, caseSensitive))) {
      total += 1;
      if (matches.length < displayLimit) {
        const matchIndex = match.index;
        matches.push({
          line: lineIndex + 1,
          column: matchIndex + 1,
          ...createPreview(lineText, matchIndex, match[0].length),
        });
      }
    }
  }
  return { matches, total };
};

const searchFileNames = (paths: string[], query: string, caseSensitive: boolean, candidatesTruncated: boolean): WorkingDirectorySearchResultDto => {
  const ranked = paths
    .map((filePath) => ({ filePath, rank: rankFileNameMatch(filePath, query, caseSensitive) }))
    .filter(({ rank }) => rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.filePath.localeCompare(right.filePath));
  const files = ranked.slice(0, MAX_FILENAME_RESULTS).map(({ filePath }) => ({ path: filePath, name: fileName(filePath), matches: [] }));
  return {
    files,
    totalMatches: ranked.length,
    scannedFiles: paths.length,
    truncated: candidatesTruncated || ranked.length > MAX_FILENAME_RESULTS,
  };
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

const replaceAllLiteral = (text: string, query: string, replacement: string, caseSensitive: boolean): { text: string; count: number } => {
  let count = 0;
  const replaced = text.replace(createLiteralRegExp(query, caseSensitive), () => {
    count += 1;
    return replacement;
  });
  if (count === 0) return { text, count };
  return { text: replaced, count };
};

const replaceTarget = (
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
  line: number,
  column: number,
): { text: string; count: number } => {
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) {
    throw new Error('The selected search result is invalid.');
  }
  const lineOffsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') lineOffsets.push(index + 1);
  }
  if (line > lineOffsets.length) {
    throw new Error('The selected search result is no longer available. Search again.');
  }
  const offset = lineOffsets[line - 1] + column - 1;
  if (offset < 0 || offset + query.length > text.length || !isLiteralMatch(text.slice(offset, offset + query.length), query, caseSensitive)) {
    throw new Error('The file changed and the selected result is no longer available. Search again.');
  }
  return { text: `${text.slice(0, offset)}${replacement}${text.slice(offset + query.length)}`, count: 1 };
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
      requireActiveRepositoryPath(repoPath, gitService.getRepoPath());
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
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
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
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      return { success: true, data: await replaceMatches(gitService, repoPath, request || ({} as WorkingDirectoryReplaceRequestDto)) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
