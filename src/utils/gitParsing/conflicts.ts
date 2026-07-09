import { parsePorcelainPath } from './status';

const CONFLICT_PORCELAIN_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);
const MERGE_IN_PROGRESS_PATTERNS: RegExp[] = [
  /\bMERGE_HEAD\b.*\bexists\b/i,
  /you have not concluded your merge/i,
  /you are in the middle of a merge/i,
  /cannot do .* during a merge/i,
];

export function parseFirstConflictPathFromPorcelain(statusOutput: string): string | null {
  if (!statusOutput.trim()) return null;
  for (const rawLine of statusOutput.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length < 3) continue;
    const code = `${line[0]}${line[1]}`;
    if (!CONFLICT_PORCELAIN_CODES.has(code)) continue;
    const path = parsePorcelainPath(line);
    if (path) return path;
  }
  return null;
}

export function parseFirstConflictPathFromGitError(errorText: string | null | undefined): string | null {
  if (!errorText) return null;
  const match = errorText.match(/Merge conflict in\s+([^\r\n]+?)(?:\s*Automatic|\s*Git Output:|$)/i) ?? errorText.match(/Merge conflict in\s+([^\r\n]+)/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+$/, '');
}

export function isMergeInProgressError(errorText: string | null | undefined): boolean {
  if (!errorText) return false;
  return MERGE_IN_PROGRESS_PATTERNS.some((pattern) => pattern.test(errorText));
}

export function resolveConflictPathAfterGitFailure(porcelainData: string | null | undefined, errorText: string | null | undefined): string | null {
  const fromPorcelain = porcelainData ? parseFirstConflictPathFromPorcelain(porcelainData) : null;
  if (fromPorcelain) return fromPorcelain;
  return parseFirstConflictPathFromGitError(errorText);
}
