import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../../../../git/GitRunner';
import { withWorkingDirectoryWrite } from '../workingDirectoryWrite';

const roots: string[] = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-directory-write-'));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-directory-write-')) throw new Error('Unexpected fixture root.');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('working-directory write scheduling', () => {
  it('keeps Git mutations behind asynchronous file work and allows the event loop to run', async () => {
    const repo = fixture();
    const execute = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const runner = new GitRunner(execute);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const write = withWorkingDirectoryWrite(
      { getRepoPath: () => repo, runner } as any,
      repo,
      'copy-files',
      () => {},
      async (ensureContext) => {
        started();
        await pending;
        ensureContext();
      },
    );
    await ready;
    const gitWrite = runner.run(repo, ['add', '--', 'file.txt']);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(execute).not.toHaveBeenCalled();
    finish();
    await Promise.all([write, gitWrite]);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('rechecks repository ownership before publication after asynchronous preparation', async () => {
    const repo = fixture();
    let active = repo;
    const published = vi.fn();
    const result = withWorkingDirectoryWrite(
      { getRepoPath: () => active } as any,
      repo,
      'copy-files',
      () => {},
      async (ensureContext) => {
        await Promise.resolve();
        active = fixture();
        ensureContext();
        published();
      },
    );
    await expect(result).rejects.toThrow(/not the active repository/);
    expect(published).not.toHaveBeenCalled();
  });
});
