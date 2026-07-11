import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitService } from '../GitService';
import { parseFileBlame } from '../main-process/parsing';

describe('HistoryService staged blame integration', () => {
  let repoPath = '';

  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-staged-blame-'));
    git('init');
    git('config', 'user.name', 'Staged Blame Test');
    git('config', 'user.email', 'staged-blame@example.invalid');
    fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'one\ntwo\nthree\n', 'utf8');
    git('add', '--', 'tracked.txt');
    git('commit', '-m', 'initial');
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('uses the immutable index blob and its final line numbers, not later working-tree edits', async () => {
    fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'one\nstaged line\nthree\n', 'utf8');
    git('add', '--', 'tracked.txt');
    fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'working-only insertion\none\nstaged line\nthree\n', 'utf8');

    const service = new GitService();
    service.setRepoPath(repoPath);
    const raw = await service.history.getStagedFileBlameRange('tracked.txt', 1, 501, repoPath);
    const lines = parseFileBlame(raw);

    expect(lines.map((line) => line.content)).toEqual(['one', 'staged line', 'three']);
    expect(lines.map((line) => line.lineNumber)).toEqual([1, 2, 3]);
    expect(lines[1]?.commitHash).toMatch(/^0{40}$/);
  });

  it('returns uncommitted blame records for a new staged file while ignoring its newer working copy', async () => {
    fs.writeFileSync(path.join(repoPath, 'new.txt'), 'staged first\nstaged second\n', 'utf8');
    git('add', '--', 'new.txt');
    fs.writeFileSync(path.join(repoPath, 'new.txt'), 'working tree replacement\n', 'utf8');

    const service = new GitService();
    service.setRepoPath(repoPath);
    const lines = parseFileBlame(await service.history.getStagedFileBlame('new.txt', repoPath));

    expect(lines.map((line) => line.content)).toEqual(['staged first', 'staged second']);
    expect(lines.every((line) => line.commitHash === '0'.repeat(40))).toBe(true);
  });
});
