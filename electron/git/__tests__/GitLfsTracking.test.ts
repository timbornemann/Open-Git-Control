import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitLfsService } from '../GitLfsService';
import { parseGitLfsPointer, type GitLfsStagingMode, type TrackWithGitLfsRequest } from '../../../src/shared/ipc/gitLfs';

vi.setConfig({ testTimeout: 60000 });
const roots: string[] = [];
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-tracking-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  for (const [key, value] of [
    ['user.name', 'LFS Test'],
    ['user.email', 'lfs@example.test'],
    ['core.autocrlf', 'false'],
    ['commit.gpgsign', 'false'],
  ])
    git(root, 'config', key, value);
  const runner = new GitRunner();
  const lfs = new GitLfsService(runner);
  const write = (name: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  };
  const request = async (name: string, staging: GitLfsStagingMode, scope: 'file' | 'extension' = 'extension', source: 'staged' | 'unstaged' = 'unstaged') => {
    const state = (await lfs.getStatus({ repoPath: root, files: [{ path: name, source }] })).files[0];
    return { repoPath: root, path: name, source, scope, staging, expectedVersion: state.version };
  };
  const index = () => fs.readFileSync(path.join(root, '.git/index'));
  const staged = (name: string) => git(root, 'show', `:${name}`);
  const pointer = (name: string, content: string) => {
    const result = parseGitLfsPointer(staged(name));
    expect(result).not.toBeNull();
    const object = path.join(root, '.git/lfs/objects', result!.oid.slice(0, 2), result!.oid.slice(2, 4), result!.oid);
    expect(fs.readFileSync(object, 'utf8')).toBe(content);
    return result;
  };
  return { root, runner, lfs, write, request, index, staged, pointer };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-lfs-tracking-'))
      throw new Error('Unsafe LFS test cleanup');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('independent Git LFS configuration and staging', () => {
  it('only configures an individual new file without creating an index or cleaning its content', async () => {
    const f = fixture();
    f.write('assets/design [1].psd', 'full working content');
    f.write('assets/design 1.psd', 'other file');
    const request = await f.request('assets/design [1].psd', 'none', 'file');
    expect(fs.existsSync(path.join(f.root, '.git/index'))).toBe(false);
    expect(await f.lfs.track(request, () => {})).toEqual({ path: request.path, attributesPath: 'assets/.gitattributes', bytes: 20, stagedFiles: 0 });
    expect(fs.existsSync(path.join(f.root, '.git/index'))).toBe(false);
    expect(fs.existsSync(path.join(f.root, '.git/lfs/objects'))).toBe(false);
    expect(fs.readFileSync(path.join(f.root, request.path), 'utf8')).toBe('full working content');
    expect(git(f.root, 'check-attr', 'filter', '--', 'assets/design 1.psd')).toContain('unspecified');
    git(f.root, 'add', '--', request.path);
    f.pointer(request.path, 'full working content');
    expect(git(f.root, 'ls-files', '--', 'assets/.gitattributes')).toBe('');
  });

  it('only configures an extension while preserving exact index bytes, partial staging and unstaged attributes', async () => {
    const f = fixture();
    f.write('selected.psd', 'staged version');
    f.write('nested/other.psd', 'other content');
    f.write('.gitattributes', '# staged attributes\n');
    git(f.root, 'add', '.');
    f.write('selected.psd', 'unstaged draft');
    f.write('.gitattributes', '# staged attributes\n# working draft\n');
    const request = await f.request('selected.psd', 'none', 'extension', 'staged');
    const index = f.index();
    fs.writeFileSync(path.join(f.root, '.git/index.lock'), 'another operation');
    expect(await f.lfs.track(request, () => {})).toMatchObject({ stagedFiles: 0 });
    expect(f.index()).toEqual(index);
    expect(fs.readFileSync(path.join(f.root, '.git/index.lock'), 'utf8')).toBe('another operation');
    expect(f.staged('selected.psd')).toBe('staged version');
    expect(f.staged('.gitattributes')).toBe('# staged attributes\n');
    expect(fs.readFileSync(path.join(f.root, '.gitattributes'), 'utf8')).toBe(
      '# staged attributes\n# working draft\n"*.psd" filter=lfs diff=lfs merge=lfs -text\n',
    );
    expect(git(f.root, 'check-attr', 'filter', '--', 'nested/other.psd')).toContain('lfs');
  });

  it('configures a repository-wide extension even when the selected file has an effective local exclusion', async () => {
    const f = fixture();
    f.write('nested/selected.psd', 'excluded');
    f.write('nested/.gitattributes', '*.psd -filter\n');
    await f.lfs.track(await f.request('nested/selected.psd', 'none'), () => {});
    expect(git(f.root, 'check-attr', 'filter', '--', 'nested/selected.psd')).toContain('unset');
    expect(git(f.root, 'check-attr', 'filter', '--', 'other.psd')).toContain('lfs');
    expect(git(f.root, 'ls-files')).toBe('');
  });

  it('stages only the selected file when requested, leaving matching files unchanged', async () => {
    const f = fixture();
    f.write('selected.psd', 'selected content');
    f.write('other.psd', 'other content');
    git(f.root, 'add', '.');
    const other = git(f.root, 'rev-parse', ':other.psd');
    expect(await f.lfs.track(await f.request('selected.psd', 'selected'), () => {})).toMatchObject({ stagedFiles: 1 });
    f.pointer('selected.psd', 'selected content');
    expect(git(f.root, 'rev-parse', ':other.psd')).toBe(other);
    expect(f.staged('.gitattributes')).toContain('filter=lfs');
  });

  it('stages matching files across directories, retaining partial staging, modes, attribute edits and exclusions', async () => {
    const f = fixture();
    f.write('selected.psd', 'base selected');
    f.write('clean.psd', 'clean tracked');
    f.write('partial.psd', 'base partial');
    f.write('ignored/tracked.psd', 'base ignored tracked');
    f.write('excluded/asset.psd', 'excluded tracked');
    f.write('excluded/.gitattributes', '*.psd -filter\n');
    f.write('deleted.psd', 'deleted');
    f.write('other.txt', 'unrelated');
    f.write('.gitattributes', '# staged attributes\n');
    git(f.root, 'add', '.');
    git(f.root, 'commit', '-m', 'base');
    f.write('partial.psd', 'partially staged content');
    f.write('other.txt', 'unrelated staged');
    git(f.root, 'add', '.');
    git(f.root, 'update-index', '--chmod=+x', 'partial.psd');
    f.write('partial.psd', 'unstaged partial draft');
    f.write('selected.psd', 'changed working content');
    f.write('nested/new [1].psd', 'new matching file');
    f.write('ignored/tracked.psd', 'changed ignored tracked');
    f.write('ignored/new.psd', 'ignored untracked');
    f.write('.gitignore', 'ignored/\n');
    f.write('.gitattributes', '# staged attributes\n# unstaged draft\n');
    fs.rmSync(path.join(f.root, 'deleted.psd'));
    const unrelated = git(f.root, 'rev-parse', ':other.txt');
    const progress = vi.fn();
    const result = await f.lfs.track(await f.request('selected.psd', 'matching'), () => {}, undefined, progress);
    expect(result).toMatchObject({ stagedFiles: 5 });
    f.pointer('selected.psd', 'changed working content');
    f.pointer('clean.psd', 'clean tracked');
    f.pointer('partial.psd', 'partially staged content');
    f.pointer('nested/new [1].psd', 'new matching file');
    f.pointer('ignored/tracked.psd', 'changed ignored tracked');
    expect(git(f.root, 'ls-files', '--stage', '--', 'partial.psd')).toMatch(/^100755 /);
    expect(fs.readFileSync(path.join(f.root, 'partial.psd'), 'utf8')).toBe('unstaged partial draft');
    expect(f.staged('excluded/asset.psd')).toBe('excluded tracked');
    expect(f.staged('deleted.psd')).toBe('deleted');
    expect(git(f.root, 'ls-files', '--', 'ignored/new.psd')).toBe('');
    expect(git(f.root, 'rev-parse', ':other.txt')).toBe(unrelated);
    expect(f.staged('.gitattributes')).not.toContain('# unstaged draft');
    expect(fs.readFileSync(path.join(f.root, '.gitattributes'), 'utf8')).toContain('# unstaged draft');
    expect(progress.mock.calls).toEqual(Array.from({ length: 6 }, (_, i) => [i, 5]));
  });

  it('retains existing pointers and rolls back a cancelled bulk conversion as a single index transaction', async () => {
    const f = fixture();
    f.write('a.psd', 'first');
    await f.lfs.track(await f.request('a.psd', 'selected'), () => {});
    const oldPointer = f.staged('a.psd');
    f.write('b.psd', 'second');
    git(f.root, 'add', '--', 'b.psd');
    const request = await f.request('a.psd', 'matching', 'extension', 'staged');
    const index = f.index();
    const attributes = fs.readFileSync(path.join(f.root, '.gitattributes'));
    const controller = new AbortController();
    await expect(
      f.lfs.track(
        request,
        () => {},
        controller.signal,
        (completed) => {
          if (completed === 1) controller.abort();
        },
      ),
    ).rejects.toThrow();
    expect(f.index()).toEqual(index);
    expect(fs.readFileSync(path.join(f.root, '.gitattributes'))).toEqual(attributes);
    expect(fs.existsSync(path.join(f.root, '.git/index.lock'))).toBe(false);
    expect(await f.lfs.track(request, () => {})).toMatchObject({ stagedFiles: 2 });
    expect(f.staged('a.psd')).toBe(oldPointer);
    f.pointer('b.psd', 'second');
  });

  it('rejects an invalid staging choice and a stale configuration-only request without changing files', async () => {
    const f = fixture();
    f.write('file.psd', 'original');
    const request = await f.request('file.psd', 'none', 'file');
    await expect(f.lfs.track({ ...request, staging: 'matching' }, () => {})).rejects.toThrow(/staging selection/);
    await expect(f.lfs.track({ ...request, staging: 'unexpected' } as unknown as TrackWithGitLfsRequest, () => {})).rejects.toThrow(/staging selection/);
    f.write('file.psd', 'changed');
    await expect(f.lfs.track(request, () => {})).rejects.toThrow(/changed/);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    expect(fs.existsSync(path.join(f.root, '.git/index'))).toBe(false);
  });

  it('rejects conflicts in matching files without modifying their index entries or attributes', async () => {
    const f = fixture();
    f.write('conflict.psd', 'base\n');
    git(f.root, 'add', '.');
    git(f.root, 'commit', '-m', 'base');
    git(f.root, 'checkout', '-b', 'other');
    f.write('conflict.psd', 'other\n');
    git(f.root, 'commit', '-am', 'other');
    git(f.root, 'checkout', 'main');
    f.write('conflict.psd', 'main\n');
    git(f.root, 'commit', '-am', 'main');
    expect(() => git(f.root, 'merge', '--no-edit', 'other')).toThrow();
    f.write('selected.psd', 'new');
    const request = await f.request('selected.psd', 'matching');
    const index = f.index();
    await expect(f.lfs.track(request, () => {})).rejects.toThrow(/Resolve conflicts/);
    expect(f.index()).toEqual(index);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
  });

  it('rejects changes to another matching file during conversion and keeps the entire previous index', async () => {
    const f = fixture();
    f.write('a.psd', 'first');
    f.write('b.psd', 'second');
    git(f.root, 'add', '.');
    git(f.root, 'commit', '-m', 'base');
    const request = await f.request('a.psd', 'matching');
    const index = f.index();
    await expect(
      f.lfs.track(
        request,
        () => {},
        undefined,
        (completed) => {
          if (completed === 1) f.write('b.psd', 'external edit');
        },
      ),
    ).rejects.toThrow(/content changed/);
    expect(f.index()).toEqual(index);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    expect(fs.readFileSync(path.join(f.root, 'b.psd'), 'utf8')).toBe('external edit');
  });
});
