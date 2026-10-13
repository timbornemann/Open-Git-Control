import { describe, expect, it } from 'vitest';
import { AnalyticsLogParser } from '../AnalyticsParsing';
import type { CommitRecord } from '../AnalyticsTypes';

describe('streamed analytics Git records', () => {
  it('preserves NUL-delimited unusual paths and UTF-8 across every byte boundary, including rename numstat records', () => {
    const records: CommitRecord[] = [],
      hash = 'a'.repeat(40),
      before = 'b'.repeat(40),
      after = 'c'.repeat(40);
    const old = ':odd\t\n\x1eä',
      path = 'new\t\n[ä]';
    const raw = Buffer.from(
      `\x1e${hash}\0\0Nämé\0person@test.invalid\x001700000000\0subject\0\n:100644 100644 ${before} ${after} R100\0${old}\0${path}\0\n2\t1\t\0${old}\0${path}\0`,
    );
    const parser = new AnalyticsLogParser((record) => records.push(record));
    for (const byte of raw) parser.write(Buffer.from([byte]));
    parser.finish();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ hash, author: { name: 'Nämé' }, changes: [{ path, oldPath: old, additions: 2, deletions: 1 }] });
  });
  it('refuses truncated metadata and filenames rather than caching a completed commit', () => {
    const parser = new AnalyticsLogParser(() => {});
    parser.write(Buffer.from(`\x1e${'a'.repeat(40)}\0parent\0name\0`));
    expect(() => parser.finish()).toThrow(/Incomplete/);
  });

  it('parses large buffered diffs without argument-stack overflow and keeps line counts attached to their paths', () => {
    const count = 50_000;
    const records: CommitRecord[] = [];
    const paths = Array.from({ length: count }, (_, i) => `file-${i}.txt`);
    const raw = paths.map((path) => `:000000 100644 ${'0'.repeat(40)} ${'b'.repeat(40)} A\0${path}\0`).join('');
    const stats = paths.map((path, i) => `${i + 1}\t0\t${path}\0`).join('');
    const parser = new AnalyticsLogParser((record) => records.push(record));
    parser.write(Buffer.from(`\x1e${'a'.repeat(40)}\0\0Name\0person@test.invalid\x001700000000\0many files\0${raw}${stats}`));
    parser.finish();
    expect(records[0].changes).toHaveLength(count);
    expect(records[0].changes[0]).toMatchObject({ path: paths[0], additions: 1 });
    expect(records[0].changes.at(-1)).toMatchObject({ path: paths.at(-1), additions: count });
  });

  it('clears path lookup state between commits', () => {
    const records: CommitRecord[] = [];
    const parser = new AnalyticsLogParser((record) => records.push(record));
    for (const [hash, additions] of [
      ['a', 1],
      ['b', 2],
    ] as const) {
      parser.write(
        Buffer.from(
          `\x1e${hash.repeat(40)}\0\0Name\0person@test.invalid\x001700000000\0subject\0:000000 100644 ${'0'.repeat(40)} ${'c'.repeat(40)} A\0same.txt\0${additions}\t0\tsame.txt\0`,
        ),
      );
    }
    parser.finish();
    expect(records.map((record) => record.changes[0].additions)).toEqual([1, 2]);
  });
});
