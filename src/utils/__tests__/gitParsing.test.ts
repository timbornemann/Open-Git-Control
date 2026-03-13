import { describe, expect, it } from 'vitest';
import {
  parseCommitDetails,
  parseGitLog,
  parseGitStatus,
  parseGitStatusDetailed,
  parseGitSubmoduleStatus,
} from '../gitParsing';

const US = '\x1f';
const NUL = '\x00';
const GS = '\x1d';

function makeRecord(fields: {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject?: string;
  parents?: string;
  refs?: string;
}) {
  return [
    fields.hash,
    fields.short,
    fields.author,
    fields.date,
    fields.subject ?? '',
    fields.parents ?? '',
    fields.refs ?? '',
  ].join(US) + NUL;
}

describe('parseGitLog', () => {
  it('returns an empty array for empty output', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('handles records with missing fields by filling defaults', () => {
    const output = `short-only${US}partial${NUL}`;
    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      hash: 'short-only',
      abbrevHash: 'partial',
      author: '',
      date: '',
      subject: '',
      parentHashes: [],
      refs: [],
      stats: { files: 0, additions: 0, deletions: 0 },
    });
  });

  it('parses subject values with pipe characters and commit stats', () => {
    const output = [
      makeRecord({
        hash: 'a'.repeat(40),
        short: 'aaaaaaa',
        author: 'Alice',
        date: '2024-10-01 10:00:00 +0000',
        subject: 'feat: keep | pipes | intact',
        parents: 'b'.repeat(40),
        refs: 'HEAD -> main',
      }),
      '12 3 src/App.tsx\x00',
      '- - assets/logo.png\x00',
    ].join('');

    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].subject).toBe('feat: keep | pipes | intact');
    expect(parsed[0].stats).toEqual({ files: 2, additions: 12, deletions: 3 });
  });

  it('ignores non-numstat tokens after a commit header', () => {
    const output = [
      makeRecord({
        hash: '9'.repeat(40),
        short: '9999999',
        author: 'Alice',
        date: '2024-10-10 10:00:00 +0000',
      }),
      'this is noise\x00',
    ].join('');

    const parsed = parseGitLog(output);
    expect(parsed[0].stats).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it('parses merge commits with multiple parents and split refs', () => {
    const parentOne = '1'.repeat(40);
    const parentTwo = '2'.repeat(40);

    const output = makeRecord({
      hash: '3'.repeat(40),
      short: '3333333',
      author: 'Merger',
      date: '2024-10-02 10:00:00 +0000',
      subject: 'Merge branch feature',
      parents: `${parentOne} ${parentTwo}`,
      refs: ['origin/main', 'tag: release/v1.0.0'].join(GS),
    });

    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].parentHashes).toEqual([parentOne, parentTwo]);
    expect(parsed[0].refs).toEqual(['origin/main', 'tag: release/v1.0.0']);
  });

  it('ignores numstat rows until the first commit header exists', () => {
    const output = ['4 2 src/ignored.ts\x00', makeRecord({
      hash: '4'.repeat(40),
      short: '4444444',
      author: 'Bot',
      date: '2024-10-03 10:00:00 +0000',
      subject: '',
      parents: '',
      refs: '',
    })].join('');

    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].stats).toEqual({ files: 0, additions: 0, deletions: 0 });
  });


  it('supports appending paged log chunks without losing earlier commits', () => {
    const firstPage = makeRecord({
      hash: 'a'.repeat(40),
      short: 'aaaaaaa',
      author: 'Page1',
      date: '2024-10-06 10:00:00 +0000',
      subject: 'first page commit',
      parents: 'b'.repeat(40),
      refs: 'HEAD -> main',
    });

    const secondPage = makeRecord({
      hash: 'c'.repeat(40),
      short: 'ccccccc',
      author: 'Page2',
      date: '2024-10-05 10:00:00 +0000',
      subject: 'second page commit',
      parents: 'd'.repeat(40),
      refs: '',
    });

    const combined = parseGitLog(firstPage + secondPage);

    expect(combined.map(commit => commit.subject)).toEqual([
      'first page commit',
      'second page commit',
    ]);
  });

  it('parses multiple commits and tolerates blank lines before tokens', () => {
    const output = [
      `\n${makeRecord({
        hash: '5'.repeat(40),
        short: '5555555',
        author: 'Anne',
        date: '2024-10-04 10:00:00 +0000',
        subject: 'fix: unicode and special chars',
        parents: '6'.repeat(40),
        refs: 'origin/feature/special',
      })}`,
      makeRecord({
        hash: '7'.repeat(40),
        short: '7777777',
        author: 'Bob',
        date: '2024-10-05 10:00:00 +0000',
        subject: 'chore: second commit',
        parents: '',
        refs: '',
      }),
    ].join('');

    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].author).toBe('Anne');
    expect(parsed[1].refs).toEqual([]);
  });
});

describe('parseGitStatusDetailed', () => {
  it('returns empty buckets for empty input', () => {
    expect(parseGitStatusDetailed('   ')).toEqual({ staged: [], unstaged: [], untracked: [] });
  });

  it('classifies staged, unstaged and untracked entries', () => {
    const output = ['.', 'M  src/staged.ts', ' M src/modified.ts', 'MM src/both.ts', '?? src/new.ts', 'D  src/deleted.ts'].join('\n');

    const parsed = parseGitStatusDetailed(output);

    expect(parsed.staged.map(entry => entry.path)).toEqual(['src/staged.ts', 'src/both.ts', 'src/deleted.ts']);
    expect(parsed.unstaged.map(entry => entry.path)).toEqual(['src/modified.ts', 'src/both.ts']);
    expect(parsed.untracked.map(entry => entry.path)).toEqual(['src/new.ts']);
  });
});

describe('parseGitStatus', () => {
  it('returns empty buckets for empty input', () => {
    expect(parseGitStatus('')).toEqual({ staged: [], modified: [], untracked: [], deleted: [] });
  });

  it('classifies porcelain status output', () => {
    const output = ['.', 'A  src/added.ts', 'M  src/staged.ts', ' D src/deleted.ts', ' M src/modified.ts', '?? src/new.ts'].join('\n');
    const parsed = parseGitStatus(output);

    expect(parsed).toEqual({
      staged: ['src/added.ts', 'src/staged.ts'],
      modified: ['src/modified.ts'],
      untracked: ['src/new.ts'],
      deleted: ['src/deleted.ts'],
    });
  });
});

describe('parseCommitDetails', () => {
  it('parses valid commit detail lines and ignores malformed ones', () => {
    const output = ['M\tsrc/App.tsx', 'A\tsrc/new-file.ts', '', 'not-a-status-line', 'R100\tsrc/old.ts -> src/new.ts'].join('\n');

    expect(parseCommitDetails(output)).toEqual([
      { status: 'M', path: 'src/App.tsx' },
      { status: 'A', path: 'src/new-file.ts' },
      { status: 'R100', path: 'src/old.ts -> src/new.ts' },
    ]);
  });

  it('returns an empty array for blank output', () => {
    expect(parseCommitDetails('  \n')).toEqual([]);
  });
});

describe('parseGitSubmoduleStatus', () => {
  it('parses clean, uninitialized, dirty and conflicted states', () => {
    const output = [
      ' 1234567890abcdef1234567890abcdef12345678 libs/clean (heads/main)',
      '-abcdefabcdefabcdefabcdefabcdefabcdefabcd libs/new',
      '+fedcbafedcbafedcbafedcbafedcbafedcbafedc libs/dirty (v1.2.0-3-gfedcba)',
      'U00112233445566778899aabbccddeeff00112233 libs/conflict (merge conflict)',
    ].join('\n');

    expect(parseGitSubmoduleStatus(output)).toEqual([
      { path: 'libs/clean', commit: '1234567890abcdef1234567890abcdef12345678', stateCode: 'clean', isDirty: false, summary: 'heads/main' },
      { path: 'libs/new', commit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd', stateCode: 'uninitialized', isDirty: false, summary: null },
      { path: 'libs/dirty', commit: 'fedcbafedcbafedcbafedcbafedcbafedcbafedc', stateCode: 'dirty', isDirty: true, summary: 'v1.2.0-3-gfedcba' },
      { path: 'libs/conflict', commit: '00112233445566778899aabbccddeeff00112233', stateCode: 'conflicted', isDirty: true, summary: 'merge conflict' },
    ]);
  });

  it('returns empty for non-matching input', () => {
    expect(parseGitSubmoduleStatus('nonsense line')).toEqual([]);
  });
});
