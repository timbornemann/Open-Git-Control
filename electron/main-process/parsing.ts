import { redactGitSensitiveText } from '../git/GitErrorFormatter';

export interface FileHistoryEntry {
  hash: string;
  abbrevHash: string;
  author: string;
  date: string;
  subject: string;
}

export interface FileBlameLine {
  lineNumber: number;
  commitHash: string;
  abbrevHash: string;
  author: string;
  authorTime: string;
  summary: string;
  content: string;
}

export interface StashEntry {
  index: number;
  name: string;
  hash: string;
  branch: string;
  subject: string;
}

export type ReleaseCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  htmlUrl?: string | null;
};

export function parseFileHistory(logOutput: string): FileHistoryEntry[] {
  if (!logOutput) return [];

  return logOutput
    .split('\x00')
    .map((record) => record.replace(/^\r?\n/, '').trim())
    .filter(Boolean)
    .map((record) => {
      let parts = record.split('\x1f');
      if (parts.length < 5 && record.includes('\\x1f')) {
        parts = record.split('\\x1f');
      }
      if (parts.length < 5 && record.includes('|')) {
        parts = record.split('|');
      }

      const [hashRaw = '', abbrevRaw = '', authorRaw = '', dateRaw = '', ...subjectRest] = parts;
      const hash = hashRaw.trim();
      if (!/^[0-9a-f]{7,64}$/i.test(hash)) {
        return null;
      }

      const abbrevHash = (abbrevRaw || '').trim() || hash.slice(0, 8);
      const author = (authorRaw || '').trim();
      const date = (dateRaw || '').trim();
      const subject = subjectRest.join('|').trim();

      return { hash, abbrevHash, author, date, subject };
    })
    .filter((entry): entry is FileHistoryEntry => Boolean(entry));
}

export function parseFileBlame(blameOutput: string): FileBlameLine[] {
  if (!blameOutput.trim()) return [];

  const lines = blameOutput.split('\n');
  const parsed: FileBlameLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i]?.trim() || '';
    const headerMatch = header.match(/^((?:[0-9a-f]{40}|[0-9a-f]{64}))\s+\d+\s+(\d+)\s+\d+$/i);

    if (!headerMatch) {
      continue;
    }

    const commitHash = headerMatch[1];
    const lineNumber = Number(headerMatch[2]);
    let author = 'Unknown';
    let authorTime = '';
    let summary = '';
    let content = '';

    for (i += 1; i < lines.length; i += 1) {
      const metaLine = lines[i];
      if (metaLine.startsWith('\t')) {
        content = metaLine.slice(1);
        break;
      }
      if (metaLine.startsWith('author ')) {
        author = metaLine.slice('author '.length).trim() || 'Unknown';
      } else if (metaLine.startsWith('author-time ')) {
        const unixSeconds = Number(metaLine.slice('author-time '.length).trim());
        if (Number.isFinite(unixSeconds)) {
          authorTime = new Date(unixSeconds * 1000).toISOString();
        }
      } else if (metaLine.startsWith('summary ')) {
        summary = metaLine.slice('summary '.length).trim();
      }
    }

    parsed.push({
      lineNumber,
      commitHash,
      abbrevHash: commitHash.slice(0, 8),
      author,
      authorTime,
      summary,
      content,
    });
  }

  return parsed;
}

export function parseReleaseCommits(raw: string): ReleaseCommit[] {
  if (!raw.trim()) return [];

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, author, date] = line.split('\x1f');
      return {
        hash: String(hash || '').trim(),
        shortHash: String(shortHash || '').trim(),
        subject: String(subject || '').trim(),
        author: String(author || '').trim(),
        date: String(date || '').trim(),
      };
    })
    .filter((entry) => Boolean(entry.hash && entry.shortHash && entry.subject));
}

export function parseStashList(stashOutput: string): StashEntry[] {
  if (!stashOutput.trim()) return [];

  if (stashOutput.includes('\x1f')) {
    return stashOutput
      .split('\x00')
      .map((record) => record.replace(/^\s+|\s+$/g, ''))
      .filter(Boolean)
      .map((record): StashEntry | null => {
        const [name = '', hash = '', ...subjectParts] = record.split('\x1f');
        const refMatch = name.match(/^stash@\{(\d+)\}$/);
        if (!refMatch || !/^[0-9a-f]{7,64}$/i.test(hash)) return null;
        const subject = subjectParts.join('\x1f').trim();
        const conventional = subject.match(/^(?:On|WIP on)\s+([^:]+):\s*(.*)$/i);
        return {
          index: Number(refMatch[1]),
          name,
          hash,
          branch: conventional?.[1]?.trim() || '',
          subject: conventional?.[2]?.trim() || subject,
        };
      })
      .filter((entry): entry is StashEntry => entry !== null);
  }

  return stashOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^stash@\{(\d+)\}:\s*(?:On|WIP on)\s+([^:]+):\s*(.+)$/i);
      if (!match) {
        return null;
      }

      const index = Number(match[1]);
      const branch = (match[2] || '').trim();
      const subject = (match[3] || '').trim();
      const hashMatch = subject.match(/^([0-9a-f]{7,64})\s+/i);
      const hash = hashMatch ? hashMatch[1] : '';

      return {
        index,
        name: `stash@{${index}}`,
        hash,
        branch,
        subject,
      };
    })
    .filter((entry): entry is StashEntry => Boolean(entry));
}

export function sanitizeRemoteUrl(value: string): string {
  return redactGitSensitiveText(value).replace(/\[REDACTED\]/g, '***');
}
