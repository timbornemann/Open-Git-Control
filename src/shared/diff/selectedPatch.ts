import { diffSelectionUnits, hunkSelectionUnits } from './lineSelection';
import { parseHunkRange, type ParsedDiff, type ParsedHunk, type ParsedLineType } from './parser';

type PatchLine = { type: ParsedLineType; text: string; rowIndex: number; noNewline: boolean };
export class DiffLineEndingDependency extends Error {}

function orientedLines(hunk: ParsedHunk, reverse: boolean): PatchLine[] {
  let index = -1;
  const noNewline = new Set<number>();
  for (const raw of hunk.rawLines) {
    if (raw === '\\ No newline at end of file') noNewline.add(index);
    else if (/^[ +\-]/.test(raw)) index++;
  }
  const lines = hunk.rows.map((line, rowIndex): PatchLine => ({ ...line, rowIndex, noNewline: noNewline.has(rowIndex) }));
  const result: PatchLine[] = [];
  const starts = new Map(hunkSelectionUnits(hunk).map((unit) => [Math.min(...unit.rowIndices), unit]));
  for (let row = 0; row < lines.length; row++) {
    if (lines[row].type === 'context') {
      result.push(lines[row]);
      continue;
    }
    const unit = starts.get(row);
    if (!unit) continue;
    const pair = unit.rowIndices.map((rowIndex) => lines[rowIndex]);
    if (reverse)
      result.push(
        ...pair.filter((line) => line.type === 'add').map((line): PatchLine => ({ ...line, type: 'del' })),
        ...pair.filter((line) => line.type === 'del').map((line): PatchLine => ({ ...line, type: 'add' })),
      );
    else result.push(...pair);
  }
  return result;
}

// Git uses C quoting for paths. Do not use shell escaping or JSON's unsupported \u escapes.
export const quotePatchPath = (path: string) =>
  '"' +
  Array.from(path, (char) => {
    if (char === '"' || char === '\\') return '\\' + char;
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? '\\' + code.toString(8).padStart(3, '0') : char;
  }).join('') +
  '"';

/** A forward patch from the current index to precisely the selected result, for either direction. */
export function buildSelectedDiffPatch(
  parsed: ParsedDiff,
  selectedIds: readonly string[],
  source: 'staged' | 'unstaged',
  file: { path: string; mode: string; exists: boolean },
): string {
  const allUnits = diffSelectionUnits(parsed);
  const selected = new Set(selectedIds);
  if (!selected.size || selected.size !== selectedIds.length || selectedIds.some((id) => !allUnits.some((unit) => unit.id === id)))
    throw new Error('Invalid diff line selection.');
  const reverse = source === 'staged';
  const fullRemoval = selected.size === allUnits.length && parsed.fileHeader.some((line) => line.startsWith(reverse ? 'new file mode ' : 'deleted file mode '));
  const existsAfter = !fullRemoval;
  const oldPath = quotePatchPath('a/' + file.path);
  const newPath = quotePatchPath('b/' + file.path);
  const patch = [`diff --git ${oldPath} ${newPath}`];
  if (!file.exists) patch.push(`new file mode ${file.mode}`);
  else if (!existsAfter) patch.push(`deleted file mode ${file.mode}`);
  patch.push(`--- ${file.exists ? oldPath : '/dev/null'}`, `+++ ${existsAfter ? newPath : '/dev/null'}`);
  let delta = 0;
  for (const hunk of parsed.hunks) {
    const range = parseHunkRange(hunk.header)!;
    const selectedRows = new Set(
      hunkSelectionUnits(hunk)
        .filter((unit) => selected.has(unit.id))
        .flatMap((unit) => unit.rowIndices),
    );
    if (!selectedRows.size) continue;
    const lines = orientedLines(hunk, reverse).flatMap((line): PatchLine[] => {
      if (line.type === 'context' || selectedRows.has(line.rowIndex)) return [line];
      return line.type === 'del' ? [{ ...line, type: 'context' }] : [];
    });
    const oldCount = lines.filter((line) => line.type !== 'add').length;
    const newCount = lines.filter((line) => line.type !== 'del').length;
    const oldStart = reverse ? range.rightStart : range.leftStart;
    const newStart = oldStart + delta + (oldCount === 0 ? 1 : newCount === 0 ? -1 : 0);
    patch.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    lines.forEach((line, row) => {
      // Appending after an unchanged unterminated line would implicitly select its newline change.
      if (line.type === 'context' && line.noNewline && lines.slice(row + 1).some((next) => next.type !== 'del')) throw new DiffLineEndingDependency();
      patch.push((line.type === 'context' ? ' ' : line.type === 'add' ? '+' : '-') + line.text);
      if (line.noNewline) patch.push('\\ No newline at end of file');
    });
    delta += newCount - oldCount;
  }
  return [...patch, ''].join('\n');
}
