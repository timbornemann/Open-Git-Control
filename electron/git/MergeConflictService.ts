import * as fs from 'fs';
import type { GitRunner } from './GitRunner';
import { normalizeRepositoryRelativePath, resolveExistingRepositoryPathWithoutSymlinks, toLiteralPathspec } from './RepositoryPathSafety';

export type ActiveRepoCommand = (args: string[]) => Promise<string>;

const DEFAULT_CONFLICT_MARKER_SIZE = 7;
const MIN_CONFLICT_MARKER_SIZE = 1;

const isMarkerLine = (line: string, character: '<' | '=' | '>', size: number, allowsLabel: boolean): boolean => {
  const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (normalizedLine.length < size) return false;
  for (let index = 0; index < size; index += 1) {
    if (normalizedLine[index] !== character) return false;
  }
  if (normalizedLine.length === size) return true;
  return allowsLabel && normalizedLine[size] === ' ';
};

/**
 * Matches one complete Git conflict block for the configured marker width.
 * Requiring an opener, separator and closer in order avoids treating an
 * isolated Markdown rule or an example label as an unresolved conflict.
 */
export const hasUnresolvedConflictMarkers = (contents: string, markerSize = DEFAULT_CONFLICT_MARKER_SIZE): boolean => {
  const normalizedSize = Number.isSafeInteger(markerSize) && markerSize >= MIN_CONFLICT_MARKER_SIZE ? markerSize : DEFAULT_CONFLICT_MARKER_SIZE;
  let insideConflict = false;
  let foundSeparator = false;

  for (const line of contents.split('\n')) {
    if (!insideConflict) {
      if (isMarkerLine(line, '<', normalizedSize, true)) {
        insideConflict = true;
        foundSeparator = false;
      }
      continue;
    }
    if (!foundSeparator && isMarkerLine(line, '=', normalizedSize, false)) {
      foundSeparator = true;
      continue;
    }
    if (foundSeparator && isMarkerLine(line, '>', normalizedSize, true)) return true;
  }
  return false;
};

export const parseConflictMarkerSize = (raw: unknown): number => {
  // `git check-attr -z` returns path, attribute name and value as a triplet.
  const text = typeof raw === 'string' ? raw : '';
  const records = text.split('\0');
  const value = records.length >= 3 ? records[2] : text.trim().split(/\s+/).pop() || '';
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= MIN_CONFLICT_MARKER_SIZE ? parsed : DEFAULT_CONFLICT_MARKER_SIZE;
};

export class MergeConflictService {
  constructor(
    private readonly getRepoPath: () => string,
    private readonly runCommand: ActiveRepoCommand,
    private readonly runGit: Pick<GitRunner, 'run'>,
  ) {}

  checkoutConflictVersion(filePath: string, side: 'ours' | 'theirs'): Promise<string> {
    return this.runCommand(['checkout', '--' + side, '--', toLiteralPathspec(filePath)]);
  }

  /**
   * Resolves a conflict by accepting the deletion side (e.g. a modify/delete
   * conflict where the other side removed the file). `git rm` stages the
   * removal and clears the unmerged entry; `-f` is required because the working
   * tree still holds the modified copy.
   */
  resolveConflictWithDeletion(filePath: string): Promise<string> {
    return this.runCommand(['rm', '-f', '--', toLiteralPathspec(filePath)]);
  }

  async markFileResolved(filePath: string): Promise<string> {
    const resolvedPath = resolveExistingRepositoryPathWithoutSymlinks(this.getRepoPath(), filePath, 'Conflict file path');
    const normalizedPath = normalizeRepositoryRelativePath(filePath, 'Conflict file path');
    const [contents, markerSizeRaw] = await Promise.all([
      fs.promises.readFile(resolvedPath, 'utf8'),
      this.runCommand(['check-attr', '-z', 'conflict-marker-size', '--', normalizedPath]),
    ]);
    if (hasUnresolvedConflictMarkers(contents, parseConflictMarkerSize(markerSizeRaw))) {
      throw new Error('Conflict markers remain in the file. Resolve them before marking the file as resolved.');
    }
    return this.runCommand(['add', '--', toLiteralPathspec(filePath)]);
  }

  continueMerge(): Promise<string> {
    return this.runGit.run(this.getRepoPath(), ['merge', '--continue'], {
      envOverrides: {
        GIT_EDITOR: 'true',
        GIT_MERGE_AUTOEDIT: 'no',
      },
    });
  }

  abortMerge(): Promise<string> {
    return this.runCommand(['merge', '--abort']);
  }
}
