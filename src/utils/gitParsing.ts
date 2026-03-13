export interface GitCommit {
  hash: string;
  abbrevHash: string;
  author: string;
  date: string;
  subject: string;
  parentHashes: string[];
  refs: string[]; // e.g. ['HEAD -> main', 'origin/main']
  stats: {
    files: number;
    additions: number;
    deletions: number;
  };
}

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
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
        ? refsRaw.split(LOG_REF_SEPARATOR).map(ref => ref.trim()).filter(Boolean)
        : [];

      current = {
        hash,
        abbrevHash,
        author,
        date,
        subject,
        parentHashes,
        refs,
        stats: { files: 0, additions: 0, deletions: 0 },
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

export interface FileEntry {
  path: string;
  x: string; // index/staging status: A, M, D, R, C, ' ', '?'
  y: string; // working tree status: M, D, ' ', '?'
}

export interface GitStatusDetailed {
  staged: FileEntry[];    // files with changes in the index (x !== ' ' && x !== '?')
  unstaged: FileEntry[];  // files with changes in the working tree (y !== ' ' && y !== '?')
  untracked: FileEntry[]; // files that are '??'
}

export function parseGitStatusDetailed(statusOutput: string): GitStatusDetailed {
  const result: GitStatusDetailed = { staged: [], unstaged: [], untracked: [] };
  if (!statusOutput.trim()) return result;

  for (const line of statusOutput.split('\n')) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const filePath = line.substring(3).trim();
    const entry: FileEntry = { path: filePath, x, y };

    if (x === '?' && y === '?') {
      result.untracked.push(entry);
    } else {
      // Staged if X is not ' ' and not '?'
      if (x !== ' ' && x !== '?') {
        result.staged.push(entry);
      }
      // Unstaged if Y is not ' ' and not '?'
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
  for (const line of statusOutput.split('\n')) {
    if (line.length < 3) continue;
    const xy = line.substring(0, 2);
    const file = line.substring(3).trim();
    if (xy === '??') { result.untracked.push(file); }
    else if (xy[0] === 'A' || xy[0] === 'M' || xy[0] === 'D') { result.staged.push(file); }
    else if (xy[1] === 'M') { result.modified.push(file); }
    else if (xy[1] === 'D') { result.deleted.push(file); }
  }
  return result;
}

export interface CommitFileDetail {
  status: string; // A, M, D, R etc.
  path: string;
}

export function parseCommitDetails(showOutput: string): CommitFileDetail[] {
  if (!showOutput.trim()) return [];

  const files: CommitFileDetail[] = [];
  const lines = showOutput.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    // Format is usually: M       src/App.tsx
    // Or: A       src/components/NewFile.tsx
    const match = line.match(/^([A-Z0-9]+)\s+(.+)$/);
    if (match) {
      files.push({
        status: match[1],
        path: match[2]
      });
    }
  }

  return files;
}


export interface GitSubmoduleStatusEntry {
  path: string;
  commit: string;
  stateCode: 'clean' | 'uninitialized' | 'dirty' | 'conflicted' | 'unknown';
  isDirty: boolean;
  summary: string | null;
}

export function parseGitSubmoduleStatus(statusOutput: string): GitSubmoduleStatusEntry[] {
  if (!statusOutput.trim()) return [];

  return statusOutput
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0)
    .map((line): GitSubmoduleStatusEntry | null => {
      const match = line.match(/^([-+U ])([0-9a-f]+)\s+([^\s]+)(?:\s+\((.+)\))?$/i);
      if (!match) return null;

      const flag = match[1];
      const stateCode = flag === ' '
        ? 'clean'
        : flag === '-'
          ? 'uninitialized'
          : flag === '+'
            ? 'dirty'
            : flag === 'U'
              ? 'conflicted'
              : 'unknown';

      return {
        path: match[3],
        commit: match[2],
        stateCode,
        isDirty: flag === '+' || flag === 'U',
        summary: match[4] || null,
      };
    })
    .filter((entry): entry is GitSubmoduleStatusEntry => entry !== null);
}
