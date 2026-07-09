export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface FileEntry {
  path: string;
  x: string;
  y: string;
}

export interface GitStatusDetailed {
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: FileEntry[];
}

function decodePorcelainPathToken(rawToken: string): string {
  const token = rawToken.trim();
  if (!token) return '';
  if (!(token.startsWith('"') && token.endsWith('"') && token.length >= 2)) {
    return token;
  }

  const escaped = token.slice(1, -1);
  const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  let output = '';
  let octetBuffer: number[] = [];

  const flushOctets = () => {
    if (octetBuffer.length === 0) return;
    if (utf8Decoder) {
      output += utf8Decoder.decode(new Uint8Array(octetBuffer));
    } else {
      output += String.fromCharCode(...octetBuffer);
    }
    octetBuffer = [];
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
      octetBuffer.push(parseInt(octal, 8));
      i += consumedDigits;
      continue;
    }

    flushOctets();
    const unescapedMap: Record<string, string> = {
      '\\': '\\',
      '"': '"',
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      v: '\v',
      a: '\x07',
    };
    output += unescapedMap[next] ?? next;
    i += 1;
  }

  flushOctets();
  return output;
}

function splitRenamePayload(pathPayload: string): [string, string] | null {
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i <= pathPayload.length - 4; i += 1) {
    const char = pathPayload[i];
    if (inQuotes) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (pathPayload.startsWith(' -> ', i)) {
      return [pathPayload.slice(0, i), pathPayload.slice(i + 4)];
    }
  }

  return null;
}

export function parsePorcelainPath(line: string): string {
  if (line.length < 3) return '';

  const payload = line.slice(3).trim();
  if (!payload) return '';

  const renameParts = splitRenamePayload(payload);
  if (renameParts) {
    return decodePorcelainPathToken(renameParts[1]);
  }

  return decodePorcelainPathToken(payload);
}

export interface GitBranchSyncFromPorcelainV2 {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

export function parseBranchSyncFromPorcelainV2(statusOutput: string): GitBranchSyncFromPorcelainV2 {
  const result: GitBranchSyncFromPorcelainV2 = {
    ahead: 0,
    behind: 0,
    hasUpstream: false,
  };

  if (!statusOutput.trim()) return result;

  for (const rawLine of statusOutput.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line) continue;

    if (line.startsWith('# branch.upstream ')) {
      result.hasUpstream = true;
      continue;
    }

    const abMatch = line.match(/^# branch\.ab \+(\d+) -(\d+)$/);
    if (abMatch) {
      result.ahead = Number(abMatch[1]);
      result.behind = Number(abMatch[2]);
      result.hasUpstream = true;
    }
  }

  return result;
}

export function countChangedEntriesFromPorcelainV2(statusOutput: string): number {
  if (!statusOutput.trim()) return 0;
  return statusOutput
    .split('\n')
    .map((line) => line.replace(/\r$/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('#')).length;
}

export function parseGitStatusDetailed(statusOutput: string): GitStatusDetailed {
  const result: GitStatusDetailed = { staged: [], unstaged: [], untracked: [] };
  if (!statusOutput.trim()) return result;

  for (const rawLine of statusOutput.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const filePath = parsePorcelainPath(line);
    if (!filePath) continue;
    const entry: FileEntry = { path: filePath, x, y };

    if (x === '?' && y === '?') {
      result.untracked.push(entry);
    } else {
      if (x !== ' ' && x !== '?') {
        result.staged.push(entry);
      }
      if (y !== ' ' && y !== '?') {
        result.unstaged.push(entry);
      }
    }
  }
  return result;
}

export function parseGitStatus(statusOutput: string): GitStatus {
  const result: GitStatus = { staged: [], modified: [], untracked: [], deleted: [] };
  if (!statusOutput.trim()) return result;
  for (const rawLine of statusOutput.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length < 3) continue;
    const xy = line.substring(0, 2);
    const file = parsePorcelainPath(line);
    if (!file) continue;
    if (xy === '??') {
      result.untracked.push(file);
    } else if (xy[0] === 'A' || xy[0] === 'M' || xy[0] === 'D' || xy[0] === 'R' || xy[0] === 'C') {
      result.staged.push(file);
    } else if (xy[1] === 'M') {
      result.modified.push(file);
    } else if (xy[1] === 'D') {
      result.deleted.push(file);
    }
  }
  return result;
}
