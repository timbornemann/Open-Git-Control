import { describe, expect, it } from 'vitest';
import {
  parseFileHistory,
  parseReleaseCommits,
  parseStashList,
  sanitizeRemoteUrl,
} from '../parsing';

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

  it('parses file history with x1f separators', () => {
    const raw = 'abc1234\x1fabcd123\x1fTim\x1f2026-03-24\x1fmessage\x00';
    const parsed = parseFileHistory(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].hash).toBe('abc1234');
    expect(parsed[0].subject).toBe('message');
  });

  it('redacts credential-bearing remote URLs', () => {
    const url = 'https://token@github.com/example/repo.git';
    expect(sanitizeRemoteUrl(url)).toBe('https://***@github.com/example/repo.git');
  });
});
