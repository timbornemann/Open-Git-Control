import { parsePorcelainStatusZ } from '../src/shared/git/porcelainStatus';

export type StatusSample = {
  statusRaw: string;
  identity: string;
  paths: string[] | null;
  hasStagedChanges: boolean;
  changeCount: number;
};

const decodeQuotedGitPath = (rawToken: string): string | null => {
  if (!(rawToken.startsWith('"') && rawToken.endsWith('"'))) return rawToken;

  const escaped = rawToken.slice(1, -1);
  let output = '';
  let octets: number[] = [];

  const flushOctets = () => {
    if (octets.length === 0) return;
    output += Buffer.from(octets).toString('utf8');
    octets = [];
  };

  for (let i = 0; i < escaped.length; i += 1) {
    const char = escaped[i];
    if (char !== '\\') {
      flushOctets();
      output += char;
      continue;
    }

    const next = escaped[i + 1];
    if (!next) {
      flushOctets();
      output += '\\';
      continue;
    }

    if (/[0-7]/.test(next)) {
      let octal = next;
      let consumedDigits = 1;
      while (consumedDigits < 3 && i + 1 + consumedDigits < escaped.length && /[0-7]/.test(escaped[i + 1 + consumedDigits])) {
        octal += escaped[i + 1 + consumedDigits];
        consumedDigits += 1;
      }
      octets.push(parseInt(octal, 8));
      i += consumedDigits;
      continue;
    }

    flushOctets();
    const unescapedMap: Record<string, string> = {
      a: '\x07',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '\\': '\\',
      '"': '"',
    };
    output += unescapedMap[next] ?? next;
    i += 1;
  }

  flushOctets();
  return output;
};

export const parseStatusPath = (line: string): string | null => {
  if (line.length < 3) return null;
  const statusCode = line.slice(0, 2);
  const payload = line.slice(3);
  if (!payload) return null;
  let rawPath = payload;
  if (statusCode.includes('R') || statusCode.includes('C')) {
    let quoted = false;
    let escaped = false;
    let renameSeparator = -1;
    for (let index = 0; index <= payload.length - 4; index += 1) {
      const char = payload[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quoted && char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (!quoted && renameSeparator < 0 && payload.slice(index, index + 4) === ' -> ') renameSeparator = index;
    }
    if (renameSeparator >= 0) rawPath = payload.slice(renameSeparator + 4);
  }
  return decodeQuotedGitPath(rawPath);
};

const quoteStatusPath = (filePath: string, force = false): string => {
  const needsQuoting = [...filePath].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f || character === '"' || character === '\\';
  });
  if (!force && !needsQuoting) return filePath;
  const escapes: Record<string, string> = {
    '\x07': '\\a',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\x0b': '\\v',
    '"': '\\"',
    '\\': '\\\\',
  };
  let encoded = '"';
  for (const character of filePath) {
    const escaped = escapes[character];
    if (escaped) {
      encoded += escaped;
    } else if (character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f) {
      for (const byte of Buffer.from(character, 'utf8')) encoded += `\\${byte.toString(8).padStart(3, '0')}`;
    } else {
      encoded += character;
    }
  }
  return `${encoded}"`;
};

export const parseNulStatus = (statusOutput: string): StatusSample => {
  const displayLines: string[] = [];
  const paths: string[] = [];
  let staged = false;

  for (const { code, path: targetPath, originalPath: sourcePath } of parsePorcelainStatusZ(statusOutput)) {
    paths.push(targetPath);
    if (code[0] !== ' ' && code[0] !== '?' && code[0] !== '!') staged = true;
    const displayPath = sourcePath ? `${quoteStatusPath(sourcePath, true)} -> ${quoteStatusPath(targetPath, true)}` : quoteStatusPath(targetPath);
    displayLines.push(`${code} ${displayPath}`);
  }

  return {
    statusRaw: displayLines.join('\n'),
    identity: statusOutput,
    paths,
    hasStagedChanges: staged,
    changeCount: new Set(paths).size,
  };
};

export const hasStagedChanges = (statusRaw: string): boolean => {
  for (const line of statusRaw.split(/\r?\n/)) {
    if (!line || line.length < 2) continue;
    const indexStatus = line[0];
    if (indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== '!') {
      return true;
    }
  }
  return false;
};
