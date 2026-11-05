import type { IpcResult } from '@/types/ipc';
export type DemoRegexRequest = { pattern: string; records: readonly (readonly string[])[]; limit: number };
const unsupported = 'Dieses Muster wird in der Übung nicht unterstützt. / This pattern is not supported in practice.';
// Git's newline-aware operators use LF boundaries, keeping CR as file content.
const lineOperators = new Map([
  ['^', '(?:^|(?<=\\n))'],
  ['$', '(?=\\n|(?![\\s\\S]))'],
  ['.', '[^\\n]'],
]);

/** Portable ERE examples only; never silently give JS-only constructs Git meaning. */
function compilePattern(pattern: string) {
  if (!pattern || pattern.length > 1_000) throw new Error(unsupported);
  let characterClass = -1,
    groups = 0;
  const expression: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const character = pattern[i];
    const insideClass = characterClass !== -1;
    if (character === '\\') {
      const escaped = pattern[++i];
      if (!escaped) throw new Error('Invalid regular expression: trailing escape.');
      if (/[A-Za-z0-9]/.test(escaped)) throw new Error(unsupported);
      expression.push(character + escaped);
      continue;
    } else if (characterClass !== -1) {
      if (character === '[' && ':.='.includes(pattern[i + 1] || ' ')) throw new Error(unsupported);
      const first = characterClass + 1 + (pattern[characterClass + 1] === '^' ? 1 : 0);
      if (character === ']' && i > first) characterClass = -1;
    } else if (character === '[') characterClass = i;
    else if (character === '(') {
      if (pattern[i + 1] === '?') throw new Error(unsupported);
      groups++;
    } else if (character === ')') {
      if (!groups) throw new Error(unsupported);
      groups--;
    } else if (character === '?' && '*+?}'.includes(pattern[i - 1] || ' ')) throw new Error(unsupported);
    expression.push(insideClass ? character : lineOperators.get(character) || character);
  }
  if (characterClass !== -1 || groups) throw new Error('Invalid regular expression: unclosed bracket or group.');
  try {
    return new RegExp(expression.join(''), 'u');
  } catch {
    throw new Error(unsupported);
  }
}

/** Executed in the dedicated worker; a slow pattern cannot block the renderer. */
export function matchDemoRegex(request: DemoRegexRequest): IpcResult<number[]> {
  try {
    const regex = compilePattern(request.pattern);
    const matches: number[] = [];
    for (let i = 0; i < request.records.length; i++) {
      if (request.records[i].some((line) => regex.test(line))) matches.push(i);
      if (matches.length >= request.limit) break;
    }
    return { success: true, data: matches };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : unsupported };
  }
}
