import * as fs from 'fs';
import { decodePorcelainPath } from './gitStatusSnapshot';
import { resolveExistingRepositoryPath } from '../git/RepositoryPathSafety';

const MAX_CONTEXT_LINE_CHARS = 140;
const MAX_CONTEXT_ITEMS_PER_HUNK = 3;
const MAX_CONTEXT_HUNKS = 3;
const MAX_CONTEXT_ITEMS_TOTAL = 12;
const MAX_UNTRACKED_SNIPPET_LINES = 12;
// Only a short prefix of an untracked file is ever used for AI context, so we
// read at most this many bytes instead of loading the whole file. This keeps a
// large (potentially multi-GB) untracked file from exhausting memory or
// blocking the event loop.
const MAX_UNTRACKED_SNIPPET_BYTES = 64 * 1024;

export type Numstat = {
  additions: number;
  deletions: number;
  isBinary: boolean;
};

export function parseNumstatLine(raw: string): Numstat {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
  if (!match) {
    return { additions: 0, deletions: 0, isBinary: false };
  }

  const isBinary = match[1] === '-' || match[2] === '-';
  return {
    additions: match[1] === '-' ? 0 : Number(match[1]),
    deletions: match[2] === '-' ? 0 : Number(match[2]),
    isBinary,
  };
}

export function clipContextLine(line: string, maxChars = MAX_CONTEXT_LINE_CHARS): string {
  const compact = String(line || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function parseNumstatReport(numstatOutput: string): Map<string, Numstat> {
  const byPath = new Map<string, Numstat>();
  const lines = (numstatOutput || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseNumstatLine(trimmed);
    const match = trimmed.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;
    const rawPath = match[3].trim();
    const renameSeparatorIndex = rawPath.lastIndexOf(' -> ');
    const targetPath = renameSeparatorIndex >= 0 ? rawPath.slice(renameSeparatorIndex + 4) : rawPath;
    const decodedPath = decodePorcelainPath(targetPath);
    if (!decodedPath) continue;
    byPath.set(decodedPath, parsed);
  }
  return byPath;
}

function pickRepresentativeIndices(length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  if (length === 2) return [0, 1];
  const middle = Math.floor((length - 1) / 2);
  return [...new Set([0, middle, length - 1])];
}

function pickRepresentativeItems<T>(values: T[], limit = 3): T[] {
  if (values.length <= limit) return [...values];
  return pickRepresentativeIndices(values.length)
    .slice(0, limit)
    .map((index) => values[index]);
}

function isDiffMetadataLine(line: string): boolean {
  return (
    /^diff --git /i.test(line) ||
    /^index /i.test(line) ||
    /^--- /i.test(line) ||
    /^\+\+\+ /i.test(line) ||
    /^new file mode /i.test(line) ||
    /^deleted file mode /i.test(line) ||
    /^similarity index /i.test(line) ||
    /^rename from /i.test(line) ||
    /^rename to /i.test(line) ||
    /^old mode /i.test(line) ||
    /^new mode /i.test(line) ||
    /^Binary files /i.test(line) ||
    /^GIT binary patch$/i.test(line)
  );
}

export function deriveStatsFromDiff(diffText: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  const lines = (diffText || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

export function buildStructuredDiffContext(diffText: string): string[] {
  const lines = (diffText || '').split(/\r?\n/);
  type Hunk = { header: string; changes: string[] };

  const hunks: Hunk[] = [];
  const metadataFallback: string[] = [];
  let currentHunk: Hunk | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith('@@')) {
      currentHunk = {
        header: clipContextLine(line),
        changes: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (isDiffMetadataLine(line)) {
      const metadata = clipContextLine(line);
      if (metadata) metadataFallback.push(metadata);
      continue;
    }

    if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      const normalized = clipContextLine(line);
      if (!normalized) continue;
      if (!currentHunk) {
        currentHunk = { header: clipContextLine('@@ synthetic @@'), changes: [] };
        hunks.push(currentHunk);
      }
      currentHunk.changes.push(normalized);
      continue;
    }
  }

  const result: string[] = [];
  const chosenHunks = pickRepresentativeItems(hunks, MAX_CONTEXT_HUNKS);
  for (const hunk of chosenHunks) {
    if (hunk.header && hunk.header !== '@@ synthetic @@') {
      result.push(`hunk ${hunk.header}`);
    }
    const chosenChanges = pickRepresentativeItems(hunk.changes, MAX_CONTEXT_ITEMS_PER_HUNK);
    result.push(...chosenChanges);
  }

  if (result.length === 0) {
    return pickRepresentativeItems(
      metadataFallback.filter((line) => !/^index /i.test(line)),
      MAX_CONTEXT_ITEMS_PER_HUNK,
    );
  }

  return result.slice(0, MAX_CONTEXT_ITEMS_TOTAL);
}

export function buildFileSnippetContext(content: string): string[] {
  const sourceLines = (content || '')
    .split(/\r?\n/)
    .map((line) => clipContextLine(line))
    .filter(Boolean);
  if (sourceLines.length === 0) return [];

  const bounded = sourceLines.slice(0, MAX_UNTRACKED_SNIPPET_LINES);
  return pickRepresentativeItems(bounded, MAX_CONTEXT_ITEMS_PER_HUNK).map((line) => `+ ${line}`);
}

export async function readUntrackedSnippet(repoPath: string, relativePath: string): Promise<string[]> {
  let handle: fs.promises.FileHandle | undefined;
  try {
    const absolutePath = resolveExistingRepositoryPath(repoPath, relativePath);
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) return [];

    // Read only a bounded prefix regardless of the file's size.
    handle = await fs.promises.open(absolutePath, 'r');
    const buffer = Buffer.alloc(MAX_UNTRACKED_SNIPPET_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_UNTRACKED_SNIPPET_BYTES, 0);
    const prefix = buffer.subarray(0, bytesRead);

    // Skip binary files (a NUL byte in the prefix): a snippet would be noise.
    if (prefix.includes(0)) return [];
    return buildFileSnippetContext(prefix.toString('utf8'));
  } catch {
    return [];
  } finally {
    await handle?.close().catch(() => {});
  }
}
