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

/** A complete ordered block avoids mistaking Markdown rules for conflicts. */
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
  const text = typeof raw === 'string' ? raw : '';
  const records = text.split('\0');
  const value = records.length >= 3 ? records[2] : text.trim().split(/\s+/).pop() || '';
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= MIN_CONFLICT_MARKER_SIZE ? parsed : DEFAULT_CONFLICT_MARKER_SIZE;
};
