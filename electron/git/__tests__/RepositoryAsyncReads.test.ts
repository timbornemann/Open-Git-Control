import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepositoryPathResolver } from '../RepositoryPathSafetyAsync';
import { readRepositoryFileBytes } from '../RepositoryFileRead';

let root: string;
let repo: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-async-reads-'));
  repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  fs.mkdirSync(path.join(repo, '.git'));
  fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'protected');
  fs.writeFileSync(path.join(repo, ' spaced.txt'), 'contents');
});
afterEach(() => {
  vi.restoreAllMocks();
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-async-reads-')) throw new Error('Unexpected fixture root.');
  fs.rmSync(root, { recursive: true, force: true });
});

describe('asynchronous repository boundaries and bounded reads', () => {
  it('preserves filenames and rejects traversal and Git metadata aliases', async () => {
    const resolver = await createRepositoryPathResolver(repo);
    expect(await resolver.existing(' spaced.txt')).toBe(await fs.promises.realpath(path.join(repo, ' spaced.txt')));
    for (const target of ['../outside', '.git/HEAD', '.GIT./HEAD', '.git:stream', 'C:\\Windows\\file']) {
      await expect(resolver.existing(target)).rejects.toThrow();
      await expect(resolver.forCreateWithoutSymlinks(target)).rejects.toThrow();
    }
    expect(await resolver.forCreateWithoutSymlinks('new/child.txt')).toBe(path.join(resolver.rootPath, 'new', 'child.txt'));
  });

  it('rejects outside links, metadata links and symlink parents without caching their targets', async () => {
    const inside = path.join(repo, 'inside');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(inside);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(inside, 'file.txt'), 'inside');
    fs.writeFileSync(path.join(outside, 'file.txt'), 'outside');
    const link = path.join(repo, 'link');
    fs.symlinkSync(inside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const resolver = await createRepositoryPathResolver(repo);
    expect(await resolver.existing('link/file.txt')).toBe(await fs.promises.realpath(path.join(inside, 'file.txt')));
    await expect(resolver.existingWithoutSymlinks('link/file.txt')).rejects.toThrow(/symbolic link/);
    await expect(resolver.forCreateWithoutSymlinks('link/new.txt')).rejects.toThrow(/symbolic link/);
    fs.unlinkSync(link);
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(resolver.existing('link/file.txt')).rejects.toThrow(/outside/);
    fs.unlinkSync(link);
    fs.symlinkSync(path.join(repo, '.git'), link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(resolver.existing('link/HEAD')).rejects.toThrow(/Git metadata/);
  });

  it('bounds samples and rejects files that grow beyond the limit after stat', async () => {
    const file = path.join(repo, ' spaced.txt');
    expect((await readRepositoryFileBytes(file, 3, true)).data.toString()).toBe('con');
    await expect(readRepositoryFileBytes(file, 3)).rejects.toThrow(/too large/);
    const handle = await fs.promises.open(file, 'r');
    const stat = handle.stat.bind(handle);
    vi.spyOn(handle, 'stat').mockImplementation(async () => {
      const before = await stat();
      await fs.promises.appendFile(file, 'additional contents');
      return before;
    });
    vi.spyOn(fs.promises, 'open').mockResolvedValueOnce(handle);
    await expect(readRepositoryFileBytes(file, 10)).rejects.toThrow(/too large/);
  });
});
