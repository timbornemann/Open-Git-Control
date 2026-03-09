import { describe, expect, it } from 'vitest';
import { parseGitLog } from '../gitParsing';

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
    fields.refs ?? ''
  ].join(US) + NUL;
}

describe('parseGitLog', () => {
  it('parses subject containing pipe characters without splitting', () => {
    const output = makeRecord({
      hash: 'a'.repeat(40),
      short: 'aaaaaaa',
      author: 'Alice',
      date: '2024-10-01 10:00:00 +0000',
      subject: 'feat: keep | pipes | intact',
      parents: 'b'.repeat(40),
      refs: 'HEAD -> main'
    });

    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].subject).toBe('feat: keep | pipes | intact');
  });

  it('parses merge commits with multiple parent hashes', () => {
    const parentOne = '1'.repeat(40);
    const parentTwo = '2'.repeat(40);
    const output = makeRecord({
      hash: '3'.repeat(40),
      short: '3333333',
      author: 'Merger',
      date: '2024-10-02 10:00:00 +0000',
      subject: 'Merge branch feature',
      parents: `${parentOne} ${parentTwo}`,
      refs: 'origin/main'
    });

    const parsed = parseGitLog(output);

    expect(parsed[0].parentHashes).toEqual([parentOne, parentTwo]);
  });

  it('parses empty subject and unusual refs separated by explicit separator', () => {
    const output = makeRecord({
      hash: '4'.repeat(40),
      short: '4444444',
      author: 'Bot',
      date: '2024-10-03 10:00:00 +0000',
      subject: '',
      parents: '',
      refs: ['tag: release/v1.0.0', 'HEAD -> feat/(strange), origin/feat/(strange)'].join(GS)
    });

    const parsed = parseGitLog(output);

    expect(parsed[0].subject).toBe('');
    expect(parsed[0].parentHashes).toEqual([]);
    expect(parsed[0].refs).toEqual([
      'tag: release/v1.0.0',
      'HEAD -> feat/(strange), origin/feat/(strange)'
    ]);
  });

  it('parses multiple commits with unicode and special characters', () => {
    const output = [
      makeRecord({
        hash: '5'.repeat(40),
        short: '5555555',
        author: 'Änne',
        date: '2024-10-04 10:00:00 +0000',
        subject: 'fix: emoji 🚀 and umlauts äöü',
        parents: '6'.repeat(40),
        refs: 'origin/feature/special'
      }),
      makeRecord({
        hash: '7'.repeat(40),
        short: '7777777',
        author: 'Bob',
        date: '2024-10-05 10:00:00 +0000',
        subject: 'chore: second commit',
        parents: '',
        refs: ''
      })
    ].join('');

    const parsed = parseGitLog(output);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].author).toBe('Änne');
    expect(parsed[0].subject).toContain('🚀');
    expect(parsed[1].refs).toEqual([]);
  });
});
