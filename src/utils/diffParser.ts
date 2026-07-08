export type DiffViewMode = 'unified' | 'side-by-side' | 'preview';
export type ParsedLineType = 'context' | 'add' | 'del';

export type ParsedLine = {
  type: ParsedLineType;
  text: string;
  leftNo: number | null;
  rightNo: number | null;
};

export type ParsedHunk = {
  id: string;
  header: string;
  rawLines: string[];
  rows: ParsedLine[];
};

export type ParsedDiff = {
  fileHeader: string[];
  hunks: ParsedHunk[];
};

const parseHunkHeader = (line: string): { leftStart: number; rightStart: number } | null => {
  const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!match) return null;
  return {
    leftStart: Number(match[1]),
    rightStart: Number(match[3]),
  };
};

export const parseDiff = (diffText: string): ParsedDiff => {
  const lines = diffText.split('\n');
  const fileHeader: string[] = [];
  const hunks: ParsedHunk[] = [];

  let currentHunk: ParsedHunk | null = null;
  let leftLine = 0;
  let rightLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line);
      if (!parsed) {
        continue;
      }

      currentHunk = {
        id: `hunk-${hunks.length + 1}`,
        header: line,
        rawLines: [],
        rows: [],
      };
      hunks.push(currentHunk);
      leftLine = parsed.leftStart;
      rightLine = parsed.rightStart;
      continue;
    }

    if (!currentHunk) {
      fileHeader.push(line);
      continue;
    }

    currentHunk.rawLines.push(line);

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.rows.push({
        type: 'add',
        text: line.slice(1),
        leftNo: null,
        rightNo: rightLine,
      });
      rightLine += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.rows.push({
        type: 'del',
        text: line.slice(1),
        leftNo: leftLine,
        rightNo: null,
      });
      leftLine += 1;
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    const contextLine = line.startsWith(' ') ? line.slice(1) : line;
    currentHunk.rows.push({
      type: 'context',
      text: contextLine,
      leftNo: leftLine,
      rightNo: rightLine,
    });
    leftLine += 1;
    rightLine += 1;
  }

  return { fileHeader, hunks };
};

export const sideBySideRows = (rows: ParsedLine[]): ParsedLine[] => {
  const output: ParsedLine[] = [];

  for (let i = 0; i < rows.length;) {
    const row = rows[i];

    if (row.type === 'context') {
      output.push(row);
      i += 1;
      continue;
    }

    if (row.type === 'del') {
      const dels: ParsedLine[] = [];
      const adds: ParsedLine[] = [];

      while (i < rows.length && rows[i].type === 'del') {
        dels.push(rows[i]);
        i += 1;
      }

      while (i < rows.length && rows[i].type === 'add') {
        adds.push(rows[i]);
        i += 1;
      }

      const max = Math.max(dels.length, adds.length);
      for (let idx = 0; idx < max; idx += 1) {
        const del = dels[idx] || null;
        const add = adds[idx] || null;
        output.push({
          type: del && add ? 'context' : del ? 'del' : 'add',
          text: `${del?.text || ''}\x1f${add?.text || ''}`,
          leftNo: del?.leftNo || null,
          rightNo: add?.rightNo || null,
        });
      }
      continue;
    }

    output.push(row);
    i += 1;
  }

  return output;
};

export const buildHunkPatch = (fileHeader: string[], hunk: ParsedHunk): string => {
  const header = fileHeader.filter((line, index) => line || index < fileHeader.length - 1);
  const rawHunkLines = hunk.rawLines.length
    ? hunk.rawLines
    : hunk.rows.map((row) => {
        const prefix = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
        return prefix + row.text;
      });
  return [...header, hunk.header, ...rawHunkLines, ''].join('\n');
};
