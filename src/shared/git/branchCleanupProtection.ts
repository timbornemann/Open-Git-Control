import type { BranchCleanupPreferences } from '../ipc/branchCleanup';

export const DEFAULT_CLEANUP_PROTECTION = ['main', 'master', 'develop', 'development'];

export function normalizeCleanupPreferences(input: BranchCleanupPreferences): BranchCleanupPreferences {
  if (!input || !Array.isArray(input.protectedPatterns) || input.protectedPatterns.length > 128) throw new Error('Invalid branch protection patterns.');
  const patterns = input.protectedPatterns.map((value) => {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 1024 ||
      /\s/.test(value) ||
      [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      throw new Error('Invalid branch protection pattern.');
    return value;
  });
  return { protectedPatterns: [...new Set([...DEFAULT_CLEANUP_PROTECTION, ...patterns])] };
}

export function cleanupPatternMatches(name: string, pattern: string): boolean {
  let nameIndex = 0,
    patternIndex = 0,
    starIndex = -1,
    retryIndex = 0;
  while (nameIndex < name.length) {
    if (pattern[patternIndex] === name[nameIndex]) {
      nameIndex++;
      patternIndex++;
    } else if (pattern[patternIndex] === '*') {
      starIndex = patternIndex++;
      retryIndex = nameIndex;
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      nameIndex = ++retryIndex;
    } else return false;
  }
  while (pattern[patternIndex] === '*') patternIndex++;
  return patternIndex === pattern.length;
}
