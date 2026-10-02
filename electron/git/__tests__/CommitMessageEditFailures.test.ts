import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editFixture } from './commitMessageEditFixture';
import { readJournals, editTempRoot } from '../commitMessageEditJournal';

describe('isolated reword failures and concurrent changes', () => {
  let fixture: ReturnType<typeof editFixture>;
  afterEach(() => fixture?.dispose());
  const unchanged = async () => {
    const { repo, git, hashes, service } = fixture;
    expect(git(['rev-parse', 'HEAD'])).toBe(hashes[2]);
    expect(await service.backups(repo)).toEqual([]);
    expect(git(['worktree', 'list', '--porcelain']).match(/^worktree /gm)).toHaveLength(1);
    for (const journal of readJournals(path.join(repo, '.git'))) expect(fs.existsSync(editTempRoot(journal.id))).toBe(false);
    expect(fs.existsSync(path.join(repo, '.git', 'HEAD.lock'))).toBe(false);
    expect(fs.existsSync(path.join(repo, '.git', 'index.lock'))).toBe(false);
  };

  it.each(['hook-failure', 'hook-message', 'hook-tree', 'signing'] as const)(
    'retains the branch after %s',
    async (kind) => {
      fixture = editFixture();
      const { repo, git, service, hashes, request, context } = fixture;
      if (kind === 'signing') {
        git(['config', 'commit.gpgsign', 'true']);
        git(['config', 'gpg.program', 'ogc-nonexistent-signing-program']);
      } else {
        const name = kind === 'hook-tree' ? 'pre-commit' : 'commit-msg';
        const body =
          kind === 'hook-failure' ? 'exit 1' : kind === 'hook-message' ? 'echo changed-by-hook >> "$1"' : 'echo changed-by-hook > file.txt\ngit add file.txt';
        fs.writeFileSync(path.join(repo, '.git', 'hooks', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      }
      await expect(service.reword(request(hashes[2]), context)).rejects.toThrow();
      await unchanged();
      expect(fs.readFileSync(path.join(repo, 'file.txt'), 'utf8')).toBe('middle\n');
    },
    20_000,
  );

  it.each(['rewriting', 'verifying', 'publishing'])(
    'cancels during %s without publishing and cleans its own worktree',
    async (phase) => {
      fixture = editFixture();
      const { service, request, context, controller } = fixture;
      await expect(
        service.reword(request(), {
          ...context,
          progress: (current) => {
            if (current === phase) controller.abort();
          },
        }),
      ).rejects.toThrow(/abort/i);
      await unchanged();
    },
    20_000,
  );

  it.each(['head', 'branch', 'index', 'reference'])(
    'rejects a concurrent external %s change just before publication',
    async (kind) => {
      fixture = editFixture();
      const { repo, git, hashes, service, request, context, commit } = fixture;
      const operation = request();
      await expect(
        service.reword(operation, {
          ...context,
          progress: (phase) => {
            if (phase !== 'publishing') return;
            if (kind === 'head') commit('external commit');
            if (kind === 'branch') git(['checkout', '--detach']);
            if (kind === 'reference') git(['tag', 'external-tag', hashes[1]]);
            if (kind === 'index') {
              fs.writeFileSync(path.join(repo, 'file.txt'), 'external work');
              git(['add', 'file.txt']);
            }
          },
        }),
      ).rejects.toThrow();
      expect(await service.backups(repo)).toEqual([]);
      if (kind === 'head') expect(git(['show', '-s', '--format=%s', 'HEAD'])).toBe('external commit');
      else expect(git(['rev-parse', 'HEAD'])).toBe(hashes[2]);
      if (kind === 'index') expect(git(['show', ':file.txt'])).toBe('external work');
    },
    20_000,
  );

  it('leaves a foreign Git lock untouched', async () => {
    fixture = editFixture();
    const { repo, service, request, context } = fixture;
    const lock = path.join(repo, '.git', 'HEAD.lock');
    await expect(
      service.reword(request(), {
        ...context,
        progress: (phase) => {
          if (phase === 'publishing') fs.writeFileSync(lock, 'another git process');
        },
      }),
    ).rejects.toThrow();
    expect(fs.readFileSync(lock, 'utf8')).toBe('another git process');
  }, 20_000);

  it('terminates a running Git hook and awaits cleanup before reporting cancellation', async () => {
    fixture = editFixture();
    const { root, repo, service, hashes, request, context, controller } = fixture;
    const marker = path.join(root, 'hook-started');
    fs.writeFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\necho started > '${marker.replace(/\\/g, '/')}'\nsleep 30\n`, { mode: 0o755 });
    const result = service.reword(request(hashes[2]), context).catch((error: unknown) => error);
    await vi.waitFor(() => expect(fs.existsSync(marker)).toBe(true), { timeout: 15_000, interval: 50 });
    controller.abort();
    expect(await result).toMatchObject({ name: 'AbortError' });
    await unchanged();
  }, 25_000);
});
