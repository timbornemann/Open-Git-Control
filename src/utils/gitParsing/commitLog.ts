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
      const refs = refsRaw
        ? refsRaw
            .split(LOG_REF_SEPARATOR)
            .map((ref) => ref.trim())
            .filter(Boolean)
        : [];

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
}

export function parseCommitDetails(showOutput: string): CommitFileDetail[] {
  if (!showOutput.trim()) return [];

  const files: CommitFileDetail[] = [];
  const lines = showOutput.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Z0-9]+)\s+(.+)$/);
    if (match) {
      files.push({
        status: match[1],
        path: match[2],
      });
    }
  }

  return files;
}
