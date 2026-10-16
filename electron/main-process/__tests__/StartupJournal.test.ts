import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StartupJournal } from '../StartupJournal';

const roots: string[] = [];
const profile = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-startup-journal-test-'));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-startup-journal-test-'))
      throw new Error('Unsafe journal fixture.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('local startup diagnostics', () => {
  it('keeps the previous startup and records ordered phases without credentials', async () => {
    const root = profile();
    const first = new StartupJournal(root);
    first.record('main-start', { version: '3.0.4' });
    first.record('document-failed', { message: 'https://alice:password123@example.invalid/repo.git', code: -6 });
    await first.flush();
    const previous = fs.readFileSync(first.file, 'utf8');
    expect(previous).not.toContain('password123');
    const next = new StartupJournal(root);
    next.record('main-start', { version: '3.0.5' });
    next.record('document-loaded');
    await next.flush();
    expect(fs.readFileSync(path.join(root, 'startup.previous.log'), 'utf8')).toBe(previous);
    expect(
      fs
        .readFileSync(next.file, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).event),
    ).toEqual(['main-start', 'document-loaded']);
  });

  it('bounds repeated errors and does not prevent startup when the log path is unavailable', async () => {
    const root = profile();
    const journal = new StartupJournal(root);
    for (let index = 0; index < 500; index++) journal.record('renderer-error', { message: 'x'.repeat(10_000) });
    await journal.flush();
    expect(fs.readFileSync(journal.file, 'utf8').trim().split('\n')).toHaveLength(128);
    expect(fs.statSync(journal.file).size).toBeLessThan(512 * 1024);
    const blocked = path.join(root, 'blocked');
    fs.writeFileSync(blocked, 'preserved');
    const unavailable = new StartupJournal(blocked);
    unavailable.record('main-start');
    await expect(unavailable.flush()).resolves.toBeUndefined();
    expect(fs.readFileSync(blocked, 'utf8')).toBe('preserved');
  });
});
