export type PorcelainStatusRecord = { code: string; path: string; originalPath?: string };

/** Porcelain v1 -z emits the destination before the extra rename/copy source.
 * File names can contain newlines, tabs, quotes and literal " -> " text. */
export function parsePorcelainStatusZ(raw: string): PorcelainStatusRecord[] {
  const tokens = raw.split('\0');
  const records: PorcelainStatusRecord[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.length < 4 || token[2] !== ' ') continue;
    const code = token.slice(0, 2);
    const originalPath = /[RC]/.test(code) ? tokens[++index] : undefined;
    if (code === '!!' || code === '  ') continue;
    records.push({ code, path: token.slice(3), ...(originalPath === undefined ? {} : { originalPath }) });
  }
  return records;
}

export function countPorcelainChanges(raw: string): number {
  return new Set(parsePorcelainStatusZ(raw).map((record) => record.path)).size;
}
