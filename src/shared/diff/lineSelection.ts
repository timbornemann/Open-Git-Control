import { parseHunkRange, type ParsedDiff, type ParsedHunk, type ParsedLine } from './parser';

export type DiffSelectionUnit = { id: string; hunkId: string; rowIndices: number[] };
export type PairedDiffRow = { left: ParsedLine | null; right: ParsedLine | null; selectionId?: string };
export type DiffSelectionBlockReason = 'binary' | 'unsupported' | 'noChanges' | 'conflict';

/** Pair within one uninterrupted change section, matching the side-by-side view. */
export function hunkSelectionUnits(hunk: ParsedHunk): DiffSelectionUnit[] {
  const units: DiffSelectionUnit[] = [];
  for (let index = 0; index < hunk.rows.length;) {
    if (hunk.rows[index].type === 'context') {
      index++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (index < hunk.rows.length && hunk.rows[index].type !== 'context') (hunk.rows[index].type === 'del' ? dels : adds).push(index++);
    for (let pair = 0; pair < Math.max(dels.length, adds.length); pair++) {
      const rowIndices = [dels[pair], adds[pair]].filter((value): value is number => value !== undefined);
      units.push({ id: `${hunk.id}:${Math.min(...rowIndices)}`, hunkId: hunk.id, rowIndices });
    }
  }
  return units;
}

export function diffSelectionUnits(parsed: ParsedDiff): DiffSelectionUnit[] {
  return parsed.hunks.flatMap(hunkSelectionUnits);
}

export function pairedDiffRows(hunk: ParsedHunk): PairedDiffRow[] {
  const byStart = new Map(hunkSelectionUnits(hunk).map((unit) => [Math.min(...unit.rowIndices), unit]));
  const result: PairedDiffRow[] = [];
  for (let index = 0; index < hunk.rows.length; index++) {
    const row = hunk.rows[index];
    if (row.type === 'context') result.push({ left: row, right: row });
    else {
      const unit = byStart.get(index);
      if (!unit) continue;
      const rows = unit.rowIndices.map((rowIndex) => hunk.rows[rowIndex]);
      result.push({ left: rows.find((line) => line.type === 'del') ?? null, right: rows.find((line) => line.type === 'add') ?? null, selectionId: unit.id });
    }
  }
  return result;
}

export function diffSelectionBlockReason(parsed: ParsedDiff, diff: string): DiffSelectionBlockReason | null {
  if (/^(?:diff --(?:cc|combined) |@@@|\* Unmerged path )/m.test(diff)) return 'conflict';
  if (/^(?:Binary files .+ differ|GIT binary patch)\r?$/m.test(diff) || diff.includes('\0')) return 'binary';
  if (/^(?:diff --(?:cc|combined) |@@@|(?:index .*|(?:old|new|new file|deleted file) mode )\b(?:120000|160000)\b|copy (?:from|to) )/m.test(diff))
    return 'unsupported';
  if (!parsed.hunks.length) return 'noChanges';
  for (const hunk of parsed.hunks) {
    const range = parseHunkRange(hunk.header);
    if (
      !range ||
      range.leftCount !== hunk.rows.filter((line) => line.type !== 'add').length ||
      range.rightCount !== hunk.rows.filter((line) => line.type !== 'del').length
    )
      return 'unsupported';
    if (hunk.rawLines.some((line) => !/^[ +\-]/.test(line) && line !== '\\ No newline at end of file')) return 'unsupported';
  }
  return diffSelectionUnits(parsed).length ? null : 'noChanges';
}

export function toggleDiffSelection(ids: readonly string[], selected: ReadonlySet<string>, anchor: string | null, id: string, range: boolean): Set<string> {
  const next = new Set(selected);
  const start = anchor === null ? -1 : ids.indexOf(anchor);
  const end = ids.indexOf(id);
  if (end < 0) return next;
  const desired = !selected.has(id);
  const changed = range && start >= 0 ? ids.slice(Math.min(start, end), Math.max(start, end) + 1) : [id];
  for (const entry of changed) {
    if (desired) next.add(entry);
    else next.delete(entry);
  }
  return next;
}
