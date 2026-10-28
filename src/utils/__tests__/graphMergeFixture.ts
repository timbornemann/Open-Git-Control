import type { GitCommit } from '../gitParsing';

/** Four GitHub PR merges, with local main one merge behind the remote before pull. */
export const MERGED_MAIN_HASHES = ['489f3c9', 'f0416b1', 'f7e3a58', '0388e63', 'c6f0ce4', '175ee6e'];
export function githubMergeHistory(pulled = false): GitCommit[] {
  const rows: Array<[string, string[], string[], string]> = [
    ['489f3c9', ['f0416b1', '176e33b'], [...(pulled ? ['HEAD -> main'] : []), 'origin/HEAD', 'origin/main'], 'Merge pull request #4 from tim/test'],
    ['176e33b', ['f0416b1'], ['test'], 'tester'],
    ['f0416b1', ['f7e3a58', 'b0bd4ba'], pulled ? [] : ['HEAD -> main'], 'Merge pull request #3 from tim/test3'],
    ['b0bd4ba', ['f7e3a58'], [], 'test'],
    ['f7e3a58', ['0388e63', 'e615edf'], [], 'Merge pull request #2 from tim/test2-branch'],
    ['e615edf', ['0388e63'], [], 'test'],
    ['0388e63', ['c6f0ce4', 'bca7ab6'], [], 'Merge pull request #1 from tim/test1'],
    ['bca7ab6', ['c6f0ce4'], [], 'bmn'],
    ['c6f0ce4', ['175ee6e'], [], 'test'],
    ['175ee6e', [], [], 'Initial commit'],
  ];
  return rows.map(([hash, parentHashes, refs, subject]) => ({
    hash,
    abbrevHash: hash,
    parentHashes,
    refs,
    subject,
    author: 'Test',
    date: '',
    stats: null,
    statsState: 'missing',
  }));
}
