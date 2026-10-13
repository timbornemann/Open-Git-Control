import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';

export type WorkingDirectoryRow = { entry: WorkingDirectoryEntryDto; isLast: boolean; ancestorIsLast: boolean[] };
const sortEntries = (entries: WorkingDirectoryEntryDto[]) =>
  entries.slice().sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));

/** One flattened ordering serves rendering, range selection and keyboard focus. */
export function workingDirectoryRows(entriesByParent: Record<string, WorkingDirectoryEntryDto[]>, expanded: Set<string>): WorkingDirectoryRow[] {
  const rows: WorkingDirectoryRow[] = [];
  const seen = new Set<string>(['']);
  const stack = [{ entries: sortEntries(entriesByParent[''] ?? []), index: 0, ancestors: [] as boolean[] }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.entries.length) {
      stack.pop();
      continue;
    }
    const entry = frame.entries[frame.index++];
    const isLast = frame.index === frame.entries.length;
    rows.push({ entry, isLast, ancestorIsLast: frame.ancestors });
    if (entry.kind === 'directory' && expanded.has(entry.path) && !seen.has(entry.path)) {
      seen.add(entry.path);
      stack.push({ entries: sortEntries(entriesByParent[entry.path] ?? []), index: 0, ancestors: [...frame.ancestors, isLast] });
    }
  }
  return rows;
}
