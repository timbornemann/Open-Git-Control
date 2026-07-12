import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FeedbackReportHistoryStore } from '../feedbackReportHistory';

describe('FeedbackReportHistoryStore', () => {
  it('deduplicates signatures and limits automatic reports to three per rolling day', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-feedback-history-'));
    let now = 1_800_000_000_000;
    const store = new FeedbackReportHistoryStore(path.join(directory, 'history.json'), () => now);
    let issueNumber = 0;
    const create = async () => ({ number: ++issueNumber, htmlUrl: `https://github.com/timbornemann/Open-Git-Control/issues/${issueNumber}` });
    try {
      expect(await store.submit('a'.repeat(64), create)).toMatchObject({ kind: 'created', issueNumber: 1 });
      expect(await store.submit('a'.repeat(64), create)).toMatchObject({ kind: 'duplicate', issueNumber: 1 });
      expect(await store.submit('b'.repeat(64), create)).toMatchObject({ kind: 'created', issueNumber: 2 });
      expect(await store.submit('c'.repeat(64), create)).toMatchObject({ kind: 'created', issueNumber: 3 });
      expect(await store.submit('d'.repeat(64), create)).toEqual({ kind: 'rate-limited' });

      now += 24 * 60 * 60 * 1000 + 1;
      expect(await store.submit('d'.repeat(64), create)).toMatchObject({ kind: 'created', issueNumber: 4 });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('serializes concurrent submissions so the rate limit cannot be exceeded', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-feedback-concurrent-'));
    const store = new FeedbackReportHistoryStore(path.join(directory, 'history.json'), () => 1_800_000_000_000);
    let created = 0;
    try {
      const results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((value) =>
          store.submit(value.repeat(64), async () => {
            created += 1;
            return { number: created, htmlUrl: `https://github.com/timbornemann/Open-Git-Control/issues/${created}` };
          }),
        ),
      );
      expect(results.filter((result) => result.kind === 'created')).toHaveLength(3);
      expect(results.filter((result) => result.kind === 'rate-limited')).toHaveLength(2);
      expect(created).toBe(3);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
