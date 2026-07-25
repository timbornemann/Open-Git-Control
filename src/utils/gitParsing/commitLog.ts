export interface GitCommit {
  hash: string;
  abbrevHash: string;
  author: string;
  date: string;
  subject: string;
  parentHashes: string[];
  refs: string[];
  stats: {
    files: number;
    additions: number;
    deletions: number;
  } | null;
  statsState: 'missing' | 'queued' | 'loading' | 'ready' | 'error';
}

const LOG_RECORD_SEPARATOR = '\x00';
const LOG_FIELD_SEPARATOR = '\x1f';
const LOG_REF_SEPARATOR = '\x1d';

function parseDecoratedRefs(refsRaw: string): string[] {
  if (!refsRaw) return [];
  return refsRaw
    .split(LOG_REF_SEPARATOR)
    .map((ref) => ref.trim())
    .filter(Boolean);
}

function splitGitLogRecord(record: string): string[] {
  const fields: string[] = [];
  let start = 0;

  for (let i = 0; i < record.length; i += 1) {
    if (record[i] === LOG_FIELD_SEPARATOR) {
      fields.push(record.slice(start, i));
      start = i + 1;
      if (fields.length === 6) {
        break;
      }
    }
  }

  fields.push(record.slice(start));
  while (fields.length < 7) {
    fields.push('');
  }

  return fields;
}

export function parseGitLog(logOutput: string): GitCommit[] {
  if (!logOutput) return [];

  // `git log -L` interleaves patches with headers. HistoryService prefixes
  // those headers with RS (0x1e), allowing us to isolate each header up to its
  // terminating NUL and ignore the patch without corrupting the next hash.
  if (logOutput.startsWith('\x1e')) {
    return logOutput
      .split('\x1e')
      .slice(1)
      .map((record) => {
        const terminator = record.indexOf(LOG_RECORD_SEPARATOR);
        return record.slice(0, terminator >= 0 ? terminator : record.length);
      })
      .filter(Boolean)
      .map((header) => {
        const [hash = '', abbrevHash = '', author = '', date = '', subject = '', parentsRaw = '', refsRaw = ''] = splitGitLogRecord(header);
        return {
          hash,
          abbrevHash,
          author,
          date,
          subject,
          parentHashes: parentsRaw.trim() ? parentsRaw.trim().split(/\s+/).filter(Boolean) : [],
          refs: parseDecoratedRefs(refsRaw),
          stats: null,
          statsState: 'missing' as const,
        };
      })
      .filter((commit) => /^[0-9a-f]{7,64}$/i.test(commit.hash));
  }

  const tokens = logOutput.split(LOG_RECORD_SEPARATOR);
  const commits: GitCommit[] = [];
  let current: GitCommit | null = null;

  const ensureCurrent = () => {
    if (!current) return;
    commits.push(current);
    current = null;
  };

  for (const rawToken of tokens) {
    const token = rawToken.replace(/^\r?\n/, '');
    if (!token) {
      ensureCurrent();
      continue;
    }

    if (token.includes(LOG_FIELD_SEPARATOR)) {
      ensureCurrent();
      const [hash = '', abbrevHash = '', author = '', date = '', subject = '', parentsRaw = '', refsRaw = ''] = splitGitLogRecord(token);
      const parentHashes = parentsRaw.trim() ? parentsRaw.trim().split(/\s+/).filter(Boolean) : [];
      const refs = parseDecoratedRefs(refsRaw);

      current = {
        hash,
        abbrevHash,
        author,
        date,
        subject,
        parentHashes,
        refs,
        stats: null,
        statsState: 'missing',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const numstatMatch = token.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!numstatMatch) continue;

    const additionsRaw = numstatMatch[1];
    const deletionsRaw = numstatMatch[2];
    if (!current.stats) {
      current.stats = { files: 0, additions: 0, deletions: 0 };
    }
    current.statsState = 'ready';
    current.stats.files += 1;
    if (additionsRaw !== '-') {
      current.stats.additions += Number(additionsRaw);
    }
    if (deletionsRaw !== '-') {
      current.stats.deletions += Number(deletionsRaw);
    }
  }

  ensureCurrent();
  return commits;
}

export interface CommitFileDetail {
  status: string;
  path: string;
  oldPath?: string;
}

export function parseCommitDetails(showOutput: string): CommitFileDetail[] {
  if (!showOutput) return [];

  const files: CommitFileDetail[] = [];

  if (showOutput.includes('\x00')) {
    const tokens = showOutput.split('\x00').filter((token) => token.length > 0);
    for (let index = 0; index < tokens.length;) {
      const status = tokens[index++] || '';
      if (!/^[A-Z][0-9]*$/.test(status)) continue;
      if (status.startsWith('R') || status.startsWith('C')) {
        const oldPath = tokens[index++] || '';
        const path = tokens[index++] || '';
        if (path) files.push({ status, path, oldPath });
        continue;
      }
      const path = tokens[index++] || '';
      if (path) files.push({ status, path });
    }
    return files;
  }

  if (!showOutput.trim()) return [];
  const lines = showOutput.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Z][0-9]*)\s+(.+)$/);
    if (match) {
      const renameParts = /^(R\d*|C\d*)$/.test(match[1]) ? match[2].split('\t') : [];
      files.push({
        status: match[1],
        path: renameParts.length >= 2 ? renameParts.at(-1) || '' : match[2],
        ...(renameParts.length >= 2 ? { oldPath: renameParts[0] } : {}),
      });
    }
  }

  return files;
}
