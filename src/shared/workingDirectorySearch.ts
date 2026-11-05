import type { WorkingDirectorySearchMatchDto, WorkingDirectorySearchResultDto } from './ipc/contracts/git';

const MAX_QUERY_LENGTH = 1_000;
const MAX_REPLACEMENT_LENGTH = 100_000;
const MAX_FILENAME_RESULTS = 500;
const PREVIEW_CONTEXT = 70;

/** Pure matching rules shared by native IO and the isolated practice provider. */
export const asSearchQuery = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Search text is required.');
  if (value.length > MAX_QUERY_LENGTH) throw new Error(`Search text cannot exceed ${MAX_QUERY_LENGTH} characters.`);
  if (/[\r\n\0]/.test(value)) throw new Error('Search text must be a single line.');
  return value;
};
export const asReplacement = (value: unknown): string => {
  const replacement = typeof value === 'string' ? value : String(value ?? '');
  if (replacement.length > MAX_REPLACEMENT_LENGTH) throw new Error(`Replacement text cannot exceed ${MAX_REPLACEMENT_LENGTH} characters.`);
  if (replacement.includes('\0')) throw new Error('Replacement text contains an invalid character.');
  return replacement;
};
const compareText = (value: string, caseSensitive: boolean): string => (caseSensitive ? value : value.toLowerCase());
export const fileName = (filePath: string): string => filePath.replace(/\\/g, '/').split('/').pop() || filePath;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createLiteralRegExp = (query: string, caseSensitive: boolean): RegExp => new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
const isLiteralMatch = (value: string, query: string, caseSensitive: boolean): boolean =>
  new RegExp(`^(?:${escapeRegExp(query)})$`, caseSensitive ? '' : 'i').test(value);

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
  return { preview: `${prefix}${lineText.slice(start, end)}${suffix}`, previewMatchStart: prefix.length + matchIndex - start, matchLength: queryLength };
};
export const findLineMatches = (
  text: string,
  query: string,
  caseSensitive: boolean,
  displayLimit: number,
): { matches: WorkingDirectorySearchMatchDto[]; total: number } => {
  const matches: WorkingDirectorySearchMatchDto[] = [];
  let total = 0;
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    for (const match of lineText.matchAll(createLiteralRegExp(query, caseSensitive))) {
      total++;
      if (matches.length < displayLimit)
        matches.push({ line: lineIndex + 1, column: match.index + 1, ...createPreview(lineText, match.index, match[0].length) });
    }
  }
  return { matches, total };
};
export const searchFileNames = (paths: string[], query: string, caseSensitive: boolean, candidatesTruncated: boolean): WorkingDirectorySearchResultDto => {
  const ranked = paths
    .map((filePath) => ({ filePath, rank: rankFileNameMatch(filePath, query, caseSensitive) }))
    .filter(({ rank }) => rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.filePath.localeCompare(right.filePath));
  return {
    files: ranked.slice(0, MAX_FILENAME_RESULTS).map(({ filePath }) => ({ path: filePath, name: fileName(filePath), matches: [] })),
    totalMatches: ranked.length,
    scannedFiles: paths.length,
    truncated: candidatesTruncated || ranked.length > MAX_FILENAME_RESULTS,
  };
};
export const replaceAllLiteral = (text: string, query: string, replacement: string, caseSensitive: boolean): { text: string; count: number } => {
  let count = 0;
  const replaced = text.replace(createLiteralRegExp(query, caseSensitive), () => {
    count++;
    return replacement;
  });
  return { text: count ? replaced : text, count };
};
export const replaceTarget = (
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
  line: number,
  column: number,
): { text: string; count: number } => {
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) throw new Error('The selected search result is invalid.');
  const lineOffsets = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') lineOffsets.push(index + 1);
  if (line > lineOffsets.length) throw new Error('The selected search result is no longer available. Search again.');
  const offset = lineOffsets[line - 1] + column - 1;
  if (offset < 0 || offset + query.length > text.length || !isLiteralMatch(text.slice(offset, offset + query.length), query, caseSensitive))
    throw new Error('The file changed and the selected result is no longer available. Search again.');
  return { text: `${text.slice(0, offset)}${replacement}${text.slice(offset + query.length)}`, count: 1 };
};
