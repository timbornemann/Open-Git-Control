import type { ConflictBlock, ConflictEntry, ConflictResolutionChoice, DiffStats } from './types';
import { parsePorcelainPath } from '../../utils/gitParsing';

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  A: { label: 'Added', color: 'var(--status-success)' },
  M: { label: 'Modified', color: 'var(--status-warning)' },
  D: { label: 'Deleted', color: 'var(--status-danger)' },
  R: { label: 'Renamed', color: 'var(--status-merged)' },
  C: { label: 'Copied', color: 'var(--status-info)' },
  '?': { label: 'Untracked', color: 'var(--status-untracked)' },
};

export const CONFLICT_LABELS: Record<string, string> = {
  UU: 'Both modified',
  AA: 'Both added',
  DD: 'Both deleted',
  AU: 'Added by us',
  UA: 'Added by them',
  DU: 'Deleted by us',
  UD: 'Deleted by them',
};

export const EMPTY_DIFF_STATS: DiffStats = { files: 0, additions: 0, deletions: 0 };

export const getStatusInfo = (code: string) => STATUS_LABELS[code] || { label: code, color: 'var(--status-untracked)' };

export const basename = (p: string) => p.split(/[\\/]/).pop() || p;

export const parseConflictEntries = (statusOutput: string): ConflictEntry[] => {
  if (!statusOutput.trim()) return [];

  const conflicts: ConflictEntry[] = [];
  for (const line of statusOutput.split('\n')) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const code = `${x}${y}`;
    if (!CONFLICT_CODES.has(code)) continue;
    const path = parsePorcelainPath(line);
    if (!path) continue;
    conflicts.push({ path, x, y, code });
  }

  return conflicts;
};

export const parseNumstatStats = (numstatOutput: string): DiffStats => {
  const stats: DiffStats = { ...EMPTY_DIFF_STATS };
  if (!numstatOutput.trim()) return stats;

  for (const line of numstatOutput.split('\n')) {
    const match = line.trim().match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;

    stats.files += 1;
    if (match[1] !== '-') {
      stats.additions += Number(match[1]);
    }
    if (match[2] !== '-') {
      stats.deletions += Number(match[2]);
    }
  }

  return stats;
};

export const formatDiffStats = (stats: DiffStats): string => `${stats.files}f +${stats.additions} -${stats.deletions}`;

export const toGitPath = (p: string) => p.replace(/\\/g, '/');

export const dirname = (p: string) => {
  const normalized = toGitPath(p);
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
};

export const extensionPattern = (p: string) => {
  const name = basename(p);
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return null;
  return `*${name.slice(idx)}`;
};

export const detectLineEnding = (value: string): string => (value.includes('\r\n') ? '\r\n' : '\n');

type IndexedConflictLine = {
  text: string;
  start: number;
  end: number;
  lineNumber: number;
};

const splitIndexedConflictLines = (content: string): IndexedConflictLine[] => {
  if (!content) return [];

  const lines: IndexedConflictLine[] = [];
  let cursor = 0;
  let lineNumber = 1;

  while (cursor < content.length) {
    const lfIndex = content.indexOf('\n', cursor);

    if (lfIndex < 0) {
      lines.push({
        text: content.slice(cursor),
        start: cursor,
        end: content.length,
        lineNumber,
      });
      break;
    }

    const textEnd = lfIndex > cursor && content[lfIndex - 1] === '\r' ? lfIndex - 1 : lfIndex;
    lines.push({
      text: content.slice(cursor, textEnd),
      start: cursor,
      end: lfIndex + 1,
      lineNumber,
    });
    cursor = lfIndex + 1;
    lineNumber += 1;
  }

  return lines;
};

const getConflictStartLabel = (line: string): string | null => {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith('<<<<<<<')) return null;
  return trimmed.slice(7).trim();
};

const isConflictSeparatorLine = (line: string): boolean => line.trim() === '=======';

const getConflictEndLabel = (line: string): string | null => {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith('>>>>>>>')) return null;
  return trimmed.slice(7).trim();
};

export const countConflictMarkerLines = (content: string): { starts: number; separators: number; ends: number } => {
  const stats = { starts: 0, separators: 0, ends: 0 };
  if (!content) return stats;

  for (const line of content.split(/\r?\n/)) {
    if (line.trimEnd().startsWith('<<<<<<<')) {
      stats.starts += 1;
      continue;
    }
    if (line.trim() === '=======') {
      stats.separators += 1;
      continue;
    }
    if (line.trimEnd().startsWith('>>>>>>>')) {
      stats.ends += 1;
    }
  }

  return stats;
};

export const parseConflictBlocks = (content: string): ConflictBlock[] => {
  const lines = splitIndexedConflictLines(content);
  if (lines.length === 0) return [];

  const blocks: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const startLabel = getConflictStartLabel(lines[i].text);
    if (startLabel === null) {
      i += 1;
      continue;
    }

    let separatorIndex = -1;
    let nestedStartBeforeSeparator = -1;

    for (let j = i + 1; j < lines.length; j += 1) {
      if (getConflictStartLabel(lines[j].text) !== null) {
        nestedStartBeforeSeparator = j;
        break;
      }
      if (isConflictSeparatorLine(lines[j].text)) {
        separatorIndex = j;
        break;
      }
      if (getConflictEndLabel(lines[j].text) !== null) {
        break;
      }
    }

    if (separatorIndex < 0) {
      i = nestedStartBeforeSeparator >= 0 ? nestedStartBeforeSeparator : i + 1;
      continue;
    }

    let endIndex = -1;
    let nestedStartBeforeEnd = -1;

    for (let j = separatorIndex + 1; j < lines.length; j += 1) {
      if (getConflictStartLabel(lines[j].text) !== null) {
        nestedStartBeforeEnd = j;
        break;
      }
      if (getConflictEndLabel(lines[j].text) !== null) {
        endIndex = j;
        break;
      }
    }

    if (endIndex < 0) {
      i = nestedStartBeforeEnd >= 0 ? nestedStartBeforeEnd : i + 1;
      continue;
    }

    const theirsLabel = getConflictEndLabel(lines[endIndex].text) || '';
    const start = lines[i].start;
    const end = lines[endIndex].end;

    blocks.push({
      start,
      end,
      marker: content.slice(start, end),
      oursLabel: startLabel,
      theirsLabel,
      ours: content.slice(lines[i].end, lines[separatorIndex].start),
      theirs: content.slice(lines[separatorIndex].end, lines[endIndex].start),
      startLine: lines[i].lineNumber,
      endLine: lines[endIndex].lineNumber,
    });

    i = endIndex + 1;
  }

  return blocks;
};

const joinBothSides = (ours: string, theirs: string, lineEnding: string): string => {
  if (!ours) return theirs;
  if (!theirs) return ours;
  const needsSeparator = !/\r?\n$/.test(ours);
  return `${ours}${needsSeparator ? lineEnding : ''}${theirs}`;
};

export const buildConflictResolution = (block: ConflictBlock, choice: ConflictResolutionChoice, lineEnding: string): string => {
  if (choice === 'ours') return block.ours;
  if (choice === 'theirs') return block.theirs;
  return joinBothSides(block.ours, block.theirs, lineEnding);
};

export const replaceConflictBlock = (content: string, block: ConflictBlock, replacement: string): string => (
  `${content.slice(0, block.start)}${replacement}${content.slice(block.end)}`
);
