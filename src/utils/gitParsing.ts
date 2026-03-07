export interface GitCommit {
  hash: string;
  abbrevHash: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export function parseGitLog(logOutput: string): GitCommit[] {
  if (!logOutput.trim()) return [];
  
  return logOutput.split('\n').map(line => {
    // Format: %H|%h|%an|%ad|%s
    const [hash, abbrevHash, author, date, ...subjectParts] = line.split('|');
    const subject = subjectParts.join('|'); // In case subject contains '|'
    return { hash, abbrevHash, author, date, subject };
  });
}

export function parseGitStatus(statusOutput: string): GitStatus {
  const result: GitStatus = {
    staged: [],
    modified: [],
    untracked: [],
    deleted: []
  };

  if (!statusOutput.trim()) return result;

  const lines = statusOutput.split('\n');
  
  for (const line of lines) {
    if (line.length < 3) continue;
    const xy = line.substring(0, 2);
    const file = line.substring(3).trim();

    // Untracked
    if (xy === '??') {
      result.untracked.push(file);
    } 
    // Staged added/modified/deleted
    else if (xy[0] === 'A' || xy[0] === 'M' || xy[0] === 'D') {
      result.staged.push(file);
    }
    // Unstaged modified
    else if (xy[1] === 'M') {
      result.modified.push(file);
    }
    // Unstaged deleted
    else if (xy[1] === 'D') {
      result.deleted.push(file);
    }
  }

  return result;
}
