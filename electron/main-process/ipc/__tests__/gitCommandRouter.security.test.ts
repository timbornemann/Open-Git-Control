import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../../../GitService';
import type { GitCommandName } from '../../gitCommandPolicy';
import { handleGitCommand } from '../gitCommandRouter';
import { assertGitWorkingTreePaths } from '../../../git/GitWorkingTreePathGuard';

// Git expands Windows 8.3 temp aliases and macOS /var before selecting a repo.
const fixtureParent = fs.realpathSync.native(os.tmpdir());
const roots: string[] = [];
async function fixture() {
  const root = fs.mkdtempSync(path.join(fixtureParent, 'ogc-policy-security-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(repo);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.txt'), 'PRIVATE_OUTSIDE_REPOSITORY\n');
  const service = new GitService();
  const run = (args: string[]) => service.runCommandAtPath(repo, args);
  const write = (file: string, data: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), data);
  };
  await run(['init', '-b', 'main']);
  for (const [key, value] of [
    ['core.autocrlf', 'false'],
    ['commit.gpgSign', 'false'],
    ['user.name', 'Policy Test'],
    ['user.email', 'policy@example.test'],
    ['maintenance.auto', 'false'],
    ['gc.auto', '0'],
  ]) {
    await run(['config', key, value]);
  }
  write('tracked.txt', 'original\n');
  await run(['add', '.']);
  await run(['commit', '-m', 'initial']);
  const command = (name: GitCommandName, ...args: string[]) => handleGitCommand({ sender: { send: vi.fn() } }, service, name, args, repo);
  const link = (target = outside) => fs.symlinkSync(target, path.join(repo, 'redirected'), process.platform === 'win32' ? 'junction' : 'dir');
  return { root, repo, outside, service, run, write, command, link };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(fixtureParent) || !path.basename(root).startsWith('ogc-policy-security-'))
      throw new Error('Unsafe test cleanup.');
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('Git IPC command security with real repositories', { timeout: 30000 }, () => {
  it('keeps dirty files when a purported checkout revision is a filename or pathspec', async () => {
    const f = await fixture();
    f.write('tracked.txt', 'keep local changes\n');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const revision of ['tracked.txt', ':(glob)**', '*']) {
      expect(await f.command('checkout', revision)).toMatchObject({ success: false });
      expect(fs.readFileSync(path.join(f.repo, 'tracked.txt'), 'utf8')).toBe('keep local changes\n');
      expect(await f.run(['branch', '--show-current'])).toBe('main');
    }
    expect(await f.command('checkout', '--', 'tracked.txt')).toMatchObject({ success: true });
    expect(fs.readFileSync(path.join(f.repo, 'tracked.txt'), 'utf8')).toBe('original\n');
  });

  it('preserves local branches, detached commits, new branches, tracking and remote guessing', async () => {
    const f = await fixture();
    const head = await f.run(['rev-parse', 'HEAD']);
    await f.run(['branch', 'feature/topic']);
    f.write('feature/topic', 'a filename may also name a branch\n');
    expect(await f.command('checkout', 'feature/topic')).toMatchObject({ success: true });
    expect(await f.command('checkout', head)).toMatchObject({ success: true });
    expect(await f.command('checkout', '-b', 'created')).toMatchObject({ success: true });
    expect(await f.command('checkout', '-B', 'created', 'main')).toMatchObject({ success: true });
    await f.run(['remote', 'add', 'origin', '../server.git']);
    await f.run(['update-ref', 'refs/remotes/origin/tracked', head]);
    await f.run(['update-ref', 'refs/remotes/origin/guessed', head]);
    expect(await f.command('checkout', '--track', 'origin/tracked')).toMatchObject({ success: true });
    expect(await f.command('checkout', 'guessed')).toMatchObject({ success: true });
    expect(await f.run(['branch', '--show-current'])).toBe('guessed');
  });

  it('rejects helper URLs before scheduling a transport or writing remote configuration', async () => {
    const f = await fixture();
    const execute = vi.spyOn(f.service, 'runCommandAtPath');
    const stream = vi.spyOn(f.service, 'streamCommandOutputAtPath');
    for (const url of ['1helper::payload', '::payload', 'custom://payload']) {
      for (const action of ['fetch', 'push'] as const) expect(await f.command(action, url)).toMatchObject({ success: false });
      expect(await f.command('remote', 'add', 'unsafe', url)).toMatchObject({ success: false });
      expect(await f.command('config', '--local', 'branch.pr-1-topic.remote', url)).toMatchObject({ success: false });
    }
    expect(execute).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(await f.run(['remote'])).toBe('');
  });

  it('keeps local repository fetches and ordinary remote management', async () => {
    const f = await fixture();
    const server = path.join(f.root, 'server.git');
    await f.service.runCommandAtPath(f.root, ['init', '--bare', server]);
    expect(await f.command('remote', 'add', 'origin', server)).toMatchObject({ success: true });
    expect(await f.command('fetch', 'origin', '--no-tags', '--quiet')).toMatchObject({ success: true });
    expect(await f.command('remote', 'rename', 'origin', 'upstream')).toMatchObject({ success: true });
    expect(await f.command('remote', 'get-url', 'upstream')).toEqual({ success: true, data: server });
    expect(await f.command('remote', 'remove', 'upstream')).toMatchObject({ success: true });
  });

  it('does not execute external diff or textconv programs during repository reads', async () => {
    const f = await fixture();
    const marker = path.join(f.repo, 'filter-executed');
    f.write('filter.sh', '#!/bin/sh\necho executed > filter-executed\ncat "$1"\n');
    f.write('.gitattributes', 'tracked.txt diff=policyprobe\n');
    await f.run(['add', '.gitattributes']);
    await f.run(['commit', '-m', 'attributes']);
    await f.run(['config', 'diff.policyprobe.textconv', 'sh ./filter.sh']);
    f.write('tracked.txt', 'changed\n');
    expect(await f.command('diff', '--', 'tracked.txt')).toMatchObject({ success: true, data: expect.stringContaining('+changed') });
    expect(await f.command('show', '--format=', 'HEAD~1')).toMatchObject({ success: true, data: expect.stringContaining('+original') });
    expect(await f.command('forensicHistory', 'regex', 'tracked.txt', 'original')).toMatchObject({ success: true });
    expect(fs.existsSync(marker)).toBe(false);
    await f.run(['config', '--unset', 'diff.policyprobe.textconv']);
    await f.run(['config', 'diff.external', 'sh ./filter.sh']);
    expect(await f.command('diff', '--', 'tracked.txt')).toMatchObject({ success: true, data: expect.stringContaining('+changed') });
    expect(fs.existsSync(marker)).toBe(false);
    expect(await f.command('show', '-s', '--format=%B', 'HEAD')).toEqual({ success: true, data: 'attributes' });
  });

  it('blocks explicit paths through outside directory aliases without reading, staging or deleting outside data', async () => {
    const f = await fixture();
    f.link();
    const status = await f.run(['status', '--porcelain=v1', '-z']);
    for (const [name, args] of [
      ['add', ['--', 'redirected/private.txt']],
      ['diff', ['--', 'redirected/private.txt']],
      ['checkout', ['HEAD', '--', 'redirected/private.txt']],
      ['clean', ['-f', '--', 'redirected/private.txt']],
      ['stash', ['push', '-u', '-m', 'selected', '--', 'redirected/private.txt']],
    ] as Array<[GitCommandName, string[]]>) {
      const result = await f.command(name, ...args);
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('outside the current repository') });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_OUTSIDE_REPOSITORY');
    }
    expect(await f.run(['status', '--porcelain=v1', '-z'])).toBe(status);
    expect(fs.readFileSync(path.join(f.outside, 'private.txt'), 'utf8')).toBe('PRIVATE_OUTSIDE_REPOSITORY\n');
    await expect(f.service.commits.stagePathsAtPath(f.repo, ['redirected/private.txt'])).rejects.toThrow('outside the current repository');
    await expect(f.service.commits.commitWithMessageAtPath(f.repo, { title: 'selected commit' }, ['redirected/private.txt'])).rejects.toThrow(
      'outside the current repository',
    );
  });

  it.runIf(process.platform === 'win32')('checks prospective checkout files before writing through an empty junction', async () => {
    const f = await fixture();
    await f.run(['checkout', '-b', 'target']);
    f.write('redirected/new.txt', 'future tree file\n');
    await f.run(['add', '.']);
    await f.run(['commit', '-m', 'new directory']);
    await f.run(['checkout', 'main']);
    fs.unlinkSync(path.join(f.outside, 'private.txt'));
    f.link();
    expect(await f.command('checkout', 'target')).toMatchObject({ success: false, error: expect.stringContaining('outside the current repository') });
    const source = await f.run(['rev-parse', 'main']);
    const target = await f.run(['rev-parse', 'target']);
    f.service.setRepoPath(f.repo);
    expect(await f.command('mergeIntoBranch', 'main', 'target', 'default', source, target)).toMatchObject({
      success: false,
      error: expect.stringContaining('outside the current repository'),
    });
    expect(fs.readdirSync(f.outside)).toEqual([]);
    expect(await f.run(['branch', '--show-current'])).toBe('main');
  });

  it.runIf(process.platform === 'win32')('blocks bulk staging, cleanup, stash and checkout through Windows junctions', async () => {
    const f = await fixture();
    // Seed an old index entry to verify that a broad diff cannot bypass the explicit-path guard.
    f.write('redirected/private.txt', 'tracked inside\n');
    await f.run(['add', '.']);
    await f.run(['commit', '-m', 'inside directory']);
    fs.rmSync(path.join(f.repo, 'redirected', 'private.txt'));
    fs.rmdirSync(path.join(f.repo, 'redirected'));
    f.link();
    for (const [name, args] of [
      ['add', ['-A']],
      ['add', ['.']],
      ['diff', []],
      ['checkout', ['main']],
      ['reset', ['--hard', await f.run(['rev-parse', 'HEAD'])]],
      ['stash', ['push', '-u', '-m', 'all']],
    ] as Array<[GitCommandName, string[]]>) {
      expect(await f.command(name, ...args)).toMatchObject({ success: false, error: expect.stringContaining('outside the current repository') });
    }
    expect(await f.command('reset', 'HEAD', '--', 'redirected/private.txt')).toMatchObject({ success: true });
    expect(await f.command('rm', '--cached', '-f', '--', 'redirected/private.txt')).toMatchObject({ success: true });
    f.write('untracked.txt', 'remove only this root file\n');
    expect(await f.command('clean', '-f')).toMatchObject({ success: true });
    expect(fs.existsSync(path.join(f.repo, 'untracked.txt'))).toBe(false);
    expect(await f.command('clean', '-f', '-d')).toMatchObject({ success: false, error: expect.stringContaining('outside the current repository') });
    expect(fs.readFileSync(path.join(f.outside, 'private.txt'), 'utf8')).toBe('PRIVATE_OUTSIDE_REPOSITORY\n');
  });

  it('keeps ignored aliases, deleted files, literal names and symlink entries usable', async () => {
    const f = await fixture();
    f.link();
    // A trailing slash only ignores directories, not POSIX symlink entries.
    f.write('.gitignore', '/redirected\n');
    expect(await f.run(['check-ignore', '--', 'redirected'])).toBe('redirected');
    f.write('docs/[draft].txt', 'literal draft\n');
    f.write('..notes', 'valid dot-prefixed name\n');
    fs.unlinkSync(path.join(f.repo, 'tracked.txt'));
    expect(await f.command('add', '-A')).toMatchObject({ success: true });
    expect(await f.command('diff', '--cached', '--', 'tracked.txt')).toMatchObject({ success: true, data: expect.stringContaining('deleted file mode') });
    expect(await f.command('reset', '--', 'docs/[draft].txt')).toMatchObject({ success: true });
    expect(await f.command('add', '--', 'docs/[draft].txt')).toMatchObject({ success: true });
    expect(await f.run(['show', ':docs/[draft].txt'])).toBe('literal draft');
    expect(await f.run(['show', ':..notes'])).toBe('valid dot-prefixed name');
    expect(await f.run(['ls-files', '--', 'redirected'])).toBe('');
  });

  it('keeps large file selections below OS argument limits and ignores unselected aliases', async () => {
    const f = await fixture();
    f.link();
    const files = Array.from({ length: 500 }, (_, index) => `selected-${index}-${'x'.repeat(80)}.txt`);
    const read = vi.fn(async (_args: string[]) => [...files, 'redirected/private.txt', 'unselected.txt'].join('\0') + '\0');
    await expect(assertGitWorkingTreePaths(f.repo, ['add', '--', ...files.map((file) => `:(literal)${file}`)], read)).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0].length).toBe(1);
    expect((read.mock.calls[0][0] as string[]).join(' ').length).toBeLessThan(8000);
  });

  it('keeps internally generated commit-detail diffs unambiguous when commit IDs also name files', async () => {
    const f = await fixture();
    const parent = await f.run(['rev-parse', 'HEAD']);
    f.write('tracked.txt', 'committed change\n');
    await f.run(['add', 'tracked.txt']);
    await f.run(['commit', '-m', 'change']);
    const commit = await f.run(['rev-parse', 'HEAD']);
    fs.symlinkSync(f.outside, path.join(f.repo, parent), process.platform === 'win32' ? 'junction' : 'dir');
    fs.symlinkSync(f.outside, path.join(f.repo, commit), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await f.command('commitDetails', commit)).toEqual({ success: true, data: 'M\0tracked.txt\0' });
  });

  it.runIf(process.platform !== 'win32')('keeps POSIX directory symlinks as link entries when staging all', async () => {
    const f = await fixture();
    f.link();
    expect(await f.command('add', '-A')).toMatchObject({ success: true });
    expect(await f.run(['ls-files', '--stage', '--', 'redirected'])).toMatch(/^120000 /);
    expect(await f.run(['show', ':redirected'])).toBe(f.outside);
  });

  it('keeps leaf symlinks as links with either core.symlinks setting', async (context) => {
    const f = await fixture();
    const target = path.join(f.outside, 'private.txt');
    try {
      fs.symlinkSync(target, path.join(f.repo, 'file-link.txt'), 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return context.skip();
      throw error;
    }
    for (const symlinks of ['true', 'false']) {
      await f.run(['config', 'core.symlinks', symlinks]);
      expect(await f.command('add', '--', 'file-link.txt')).toMatchObject({ success: true });
      expect(await f.run(['ls-files', '--stage', '--', 'file-link.txt'])).toMatch(/^120000 /);
      // Git for Windows serializes separators as '/', while Node uses '\\'.
      expect(path.normalize(await f.run(['show', ':file-link.txt']))).toBe(path.normalize(target));
    }
  });
});
