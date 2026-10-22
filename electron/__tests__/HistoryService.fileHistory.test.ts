import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryService } from '../git/HistoryService';
import { parseFileHistory } from '../main-process/parsing';

let repo: string | undefined;
afterEach(() => {
  if (!repo) return;
  const target = resolve(repo);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ogc-history-paths-')) throw new Error('Unexpected fixture cleanup path');
  rmSync(target, { recursive: true, force: true });
  repo = undefined;
});

describe('historical file paths', () => {
  it('returns the path at each actual commit across multiple renames and deletion', async () => {
    repo = mkdtempSync(join(tmpdir(), 'ogc-history-paths-'));
    const git = (args: string[]) =>
      execFileSync('git', ['-c', `core.hooksPath=${join(repo!, 'no-hooks')}`, '-c', 'commit.gpgsign=false', ...args], {
        cwd: repo,
        encoding: 'utf8',
        windowsHide: true,
      });
    git(['init', '--quiet']);
    git(['config', 'user.name', 'History test']);
    git(['config', 'user.email', 'history@example.invalid']);
    git(['config', 'core.autocrlf', 'false']);
    const commit = (message: string) => {
      git(['add', '-A']);
      git(['commit', '--quiet', '-m', message]);
      return git(['rev-parse', 'HEAD']).trim();
    };
    const oldPath = 'old/ spaced file.ts',
      middlePath = 'middle file.ts',
      finalPath = 'nested/final file.ts';
    mkdirSync(join(repo, 'old'));
    writeFileSync(join(repo, oldPath), 'original content\n');
    const added = commit('Add original file');
    renameSync(join(repo, oldPath), join(repo, middlePath));
    const firstRename = commit('Rename file');
    mkdirSync(join(repo, 'nested'));
    renameSync(join(repo, middlePath), join(repo, finalPath));
    const secondRename = commit('Rename again');
    appendFileSync(join(repo, finalPath), 'updated content\n');
    const modified = commit('Modify file');
    unlinkSync(join(repo, finalPath));
    const deleted = commit('Delete file');

    const service = new HistoryService(
      async (args) => git(args),
      async (_repo, args) => git(args),
    );
    const entries = parseFileHistory(await service.getFileHistory(finalPath, 80, deleted, repo));
    expect(entries.map(({ hash, path }) => ({ hash, path }))).toEqual([
      { hash: deleted, path: finalPath },
      { hash: modified, path: finalPath },
      { hash: secondRename, path: finalPath },
      { hash: firstRename, path: middlePath },
      { hash: added, path: oldPath },
    ]);
    const complete = parseFileHistory(await service.getFileHistory(oldPath, 80, added, repo, { includeFuture: true }));
    expect(complete).toEqual(entries);
    const middle = parseFileHistory(await service.getFileHistory(middlePath, 80, firstRename, repo, { includeFuture: true }));
    expect(middle).toEqual(entries);
    const secondPage = parseFileHistory(await service.getFileHistory(oldPath, 2, added, repo, { includeFuture: true, offset: 2 }));
    expect(secondPage).toEqual(entries.slice(2, 4));

    writeFileSync(join(repo, finalPath), 'An unrelated replacement\n');
    const replacement = commit('Reuse the deleted path');
    expect(parseFileHistory(await service.getFileHistory(oldPath, 80, added, repo, { includeFuture: true }))).toEqual(entries);
    expect(parseFileHistory(await service.getFileHistory(finalPath, 80, deleted, repo, { includeFuture: true }))).toEqual(entries);

    const mainBranch = git(['branch', '--show-current']).trim();
    git(['checkout', '--quiet', '-b', 'side-history', firstRename]);
    appendFileSync(join(repo, middlePath), 'Side branch change\n');
    const branchAnchor = commit('Change file on side branch');
    const sidePath = 'side-renamed.ts';
    renameSync(join(repo, middlePath), join(repo, sidePath));
    const branchFuture = commit('Rename on side branch');
    git(['checkout', '--quiet', mainBranch]);
    const sideHistory = parseFileHistory(await service.getFileHistory(middlePath, 80, branchAnchor, repo, { includeFuture: true }));
    expect(sideHistory.map(({ hash, path }) => ({ hash, path }))).toEqual([
      { hash: branchFuture, path: sidePath },
      { hash: branchAnchor, path: middlePath },
      { hash: firstRename, path: middlePath },
      { hash: added, path: oldPath },
    ]);
    expect(sideHistory.some((entry) => entry.hash === replacement)).toBe(false);
  }, 20_000);
});
