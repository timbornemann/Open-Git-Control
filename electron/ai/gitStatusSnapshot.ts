export type StatusEntry = {
  path: string;
  x: string;
  y: string;
  code: string;
};

export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'other';

export function decodePorcelainPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }

  const body = trimmed.slice(1, -1);
  const bytes: number[] = [];
  const escapeToByte: Record<string, number> = {
    a: 0x07,
    b: 0x08,
    f: 0x0c,
    n: 0x0a,
    r: 0x0d,
    t: 0x09,
    v: 0x0b,
    '\\': 0x5c,
    '"': 0x22,
  };

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'));
      continue;
    }

    const escaped = body[i + 1];
    if (!escaped) {
      bytes.push(0x5c);
      break;
    }

    i += 1;
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && i + 1 < body.length && /[0-7]/.test(body[i + 1])) {
        i += 1;
        octal += body[i];
      }
      bytes.push(parseInt(octal, 8));
      continue;
    }

    const mapped = escapeToByte[escaped];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    bytes.push(...Buffer.from(escaped, 'utf8'));
  }

  return Buffer.from(bytes).toString('utf8');
}

export function parseStatusPorcelain(statusOutput: string): StatusEntry[] {
  if (!statusOutput.trim()) return [];

  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3)
    .map((line) => {
      const x = line[0];
      const y = line[1];
      const rawPath = line.slice(3).trim();
      const renameSeparatorIndex = rawPath.lastIndexOf(' -> ');
      const targetPath = renameSeparatorIndex >= 0 ? rawPath.slice(renameSeparatorIndex + 4) : rawPath;
      const path = decodePorcelainPath(targetPath);
      return { path, x, y, code: `${x}${y}` };
    })
    .filter((entry) => entry.path.length > 0);
}

export function detectChangeType(entry: StatusEntry): FileChangeType {
  if (entry.code === '??' || entry.x === '?' || entry.y === '?') return 'untracked';
  const code = `${entry.x}${entry.y}`;
  if (code.includes('R')) return 'renamed';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  if (code.includes('M')) return 'modified';
  return 'other';
}

export function getExtension(pathValue: string): string {
  const idx = pathValue.lastIndexOf('.');
  if (idx < 0 || idx === pathValue.length - 1) return 'none';
  return pathValue.slice(idx + 1).toLowerCase();
}

export function getTopDirectory(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/');
  const first = normalized.split('/')[0];
  return first || 'root';
}

export function buildGroupKey(pathValue: string, changeType: FileChangeType): string {
  const normalized = pathValue.replace(/\\/g, '/').toLowerCase();
  const ext = getExtension(normalized);
  const topDir = getTopDirectory(normalized);

  if (/package-lock\.json$|yarn\.lock$|pnpm-lock\.ya?ml$|bun\.lockb$/.test(normalized)) {
    return 'special:lockfiles';
  }

  if (/(^|\/)(migrations?|db\/migrate|prisma\/migrations)(\/|$)/.test(normalized)) {
    return 'special:migrations';
  }

  if (/(^|\/)(dist|build|coverage|out|target|generated|.next)(\/|$)/.test(normalized) || /\.min\./.test(normalized)) {
    return 'special:generated';
  }

  if (['md', 'mdx', 'txt', 'rst', 'adoc'].includes(ext)) {
    return 'special:docs';
  }

  return `${topDir}:${ext}:${changeType}`;
}
