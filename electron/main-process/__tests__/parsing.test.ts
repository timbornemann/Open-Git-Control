import { describe, expect, it } from 'vitest';
import { parseFileBlame, parseFileHistory, parseReleaseCommits, parseStashList, sanitizeRemoteUrl } from '../parsing';

describe('main-process parsing helpers', () => {
  it('parses release commits from x1f separated rows', () => {
    const raw = 'abc1234\x1fabc1234\x1ffeat: add thing\x1fTim\x1f2026-03-24';
    const parsed = parseReleaseCommits(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      hash: 'abc1234',
      shortHash: 'abc1234',
      subject: 'feat: add thing',
      author: 'Tim',
      date: '2026-03-24',
    });
  });

  it('parses stash list entries', () => {
    const raw = 'stash@{2}: On main: abcd123 fix parser';
    const parsed = parseStashList(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      index: 2,
      name: 'stash@{2}',
      hash: 'abcd123',
      branch: 'main',
      subject: 'abcd123 fix parser',
    });
  });

  it('keeps custom and localized stash subjects from machine-readable output', () => {
    const hash = 'a'.repeat(40);
    const raw = `stash@{0}\x1f${hash}\x1fBenutzerdefinierte Sicherung ohne Standardpraefix\x00\nstash@{1}\x1f${hash}\x1fOn feature/demo: named stash\x00`;
    expect(parseStashList(raw)).toEqual([
      {
        index: 0,
        name: 'stash@{0}',
        hash,
        branch: '',
        subject: 'Benutzerdefinierte Sicherung ohne Standardpraefix',
      },
      {
        index: 1,
        name: 'stash@{1}',
        hash,
        branch: 'feature/demo',
        subject: 'named stash',
      },
    ]);
  });

  it('parses file history with x1f separators', () => {
    const raw = 'abc1234\x1fabcd123\x1fTim\x1f2026-03-24\x1fmessage\x00';
    const parsed = parseFileHistory(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].hash).toBe('abc1234');
    expect(parsed[0].subject).toBe('message');
  });

  it('parses SHA-256 file history and blame records', () => {
    const hash = 'a'.repeat(64);
    const history = parseFileHistory(`${hash}\x1f${hash.slice(0, 12)}\x1fTim\x1f2026-07-10\x1fsha256 history\x00`);
    const blame = parseFileBlame(`${hash} 1 3 1\nauthor Tim\nauthor-time 1783641600\nsummary sha256 blame\n\tcontent`);

    expect(history[0]?.hash).toBe(hash);
    expect(blame[0]).toMatchObject({ commitHash: hash, lineNumber: 3, content: 'content' });
  });

  it('redacts credential-bearing remote URLs', () => {
    const url = 'https://token@github.com/example/repo.git';
    expect(sanitizeRemoteUrl(url)).toBe('https://***@github.com/example/repo.git');
  });

  it('redacts query and SCP-style credentials in diagnostic remote lines', () => {
    expect(sanitizeRemoteUrl('origin\thttps://github.com/example/repo.git?access_token=ghp_super-secret-value (fetch)')).toBe(
      'origin\thttps://github.com/example/repo.git?access_token=*** (fetch)',
    );
    expect(sanitizeRemoteUrl('origin\tgithub_pat_super-secret-value@github.com:example/repo.git (push)')).toBe(
      'origin\t***@github.com:example/repo.git (push)',
    );
    expect(sanitizeRemoteUrl('https://host/repo.git?X-Amz-Signature=secret-signature&safe=1')).toBe('https://host/repo.git?X-Amz-Signature=***&safe=1');
    expect(sanitizeRemoteUrl('https://host/repo.git?oauth_token=secret-oauth&refreshToken=secret-refresh&safe=1')).toBe(
      'https://host/repo.git?oauth_token=***&refreshToken=***&safe=1',
    );
  });
});
