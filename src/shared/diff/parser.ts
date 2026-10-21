export type DiffViewMode = 'unified' | 'side-by-side' | 'preview';
export type ParsedLineType = 'context' | 'add' | 'del';
export type ParsedLine = { type: ParsedLineType; text: string; leftNo: number | null; rightNo: number | null };
export type ParsedHunk = { id: string; header: string; rawLines: string[]; rows: ParsedLine[] };
export type ParsedDiff = { fileHeader: string[]; hunks: ParsedHunk[] };

export const parseHunkRange = (line: string) => {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  return match ? { leftStart: Number(match[1]), leftCount: Number(match[2] ?? 1), rightStart: Number(match[3]), rightCount: Number(match[4] ?? 1) } : null;
};

export const parseDiff = (diffText: string): ParsedDiff => {
  const lines = diffText.split('\n');
  // The terminator of the patch is not another context line in the file.
  if (lines.at(-1) === '') lines.pop();
  const fileHeader: string[] = [];
  const hunks: ParsedHunk[] = [];
  let current: ParsedHunk | null = null;
  let leftNo = 0;
  let rightNo = 0;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      const range = parseHunkRange(line);
      if (!range) continue;
      current = { id: `hunk-${hunks.length + 1}`, header: line, rawLines: [], rows: [] };
      hunks.push(current);
      leftNo = range.leftStart;
      rightNo = range.rightStart;
    } else if (!current) fileHeader.push(line);
    else {
      current.rawLines.push(line);
      // Within a hunk +++ and --- are file contents, never file headers.
      if (line.startsWith('+')) current.rows.push({ type: 'add', text: line.slice(1), leftNo: null, rightNo: rightNo++ });
      else if (line.startsWith('-')) current.rows.push({ type: 'del', text: line.slice(1), leftNo: leftNo++, rightNo: null });
      else if (line.startsWith(' ')) current.rows.push({ type: 'context', text: line.slice(1), leftNo: leftNo++, rightNo: rightNo++ });
    }
  }
  return { fileHeader, hunks };
};

/** Legacy presentation helper. Selectable rows retain their original identities instead. */
export const sideBySideRows = (rows: ParsedLine[]): ParsedLine[] => {
  const output: ParsedLine[] = [];
  for (let i = 0; i < rows.length;) {
    const row = rows[i];
    if (row.type !== 'del') {
      output.push(row);
      i++;
      continue;
    }
    const dels: ParsedLine[] = [];
    const adds: ParsedLine[] = [];
    while (i < rows.length && rows[i].type === 'del') dels.push(rows[i++]);
    while (i < rows.length && rows[i].type === 'add') adds.push(rows[i++]);
    for (let index = 0; index < Math.max(dels.length, adds.length); index++) {
      const del = dels[index];
      const add = adds[index];
      output.push({
        type: del && add ? 'context' : del ? 'del' : 'add',
        text: `${del?.text || ''}\x1f${add?.text || ''}`,
        leftNo: del?.leftNo ?? null,
        rightNo: add?.rightNo ?? null,
      });
    }
  }
  return output;
};

export const buildHunkPatch = (fileHeader: string[], hunk: ParsedHunk): string => {
  const header = fileHeader.filter((line, index) => (line || index < fileHeader.length - 1) && !/^index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?$/i.test(line));
  const raw = hunk.rawLines.length ? hunk.rawLines : hunk.rows.map((row) => (row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ') + row.text);
  return [...header, hunk.header, ...raw, ''].join('\n');
};
