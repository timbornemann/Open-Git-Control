import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitLfsService } from '../GitLfsService';
import { RepositoryFileViewerService } from '../RepositoryFileViewerService';
import { RepositoryFiles } from '../RepositoryFiles';
import { lfsRecommendation, appendLfsRule } from '../GitLfsRules';
import { localLfsObject } from '../GitLfsObjects';
import { parseGitLfsPointer } from '../../../src/shared/ipc/gitLfs';

const roots: string[] = [];
vi.setConfig({ testTimeout: 30000 });
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'LFS Test');
  git(root, 'config', 'user.email', 'lfs@example.test');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'config', 'commit.gpgsign', 'false');
  const runner = new GitRunner();
  const lfs = new GitLfsService(runner);
  const files = new RepositoryFiles(
    () => root,
    (cwd, ref, maxBytes) => runner.runBuffer(cwd, ['show', ref], { maxBytes, tooLargeMessage: 'Too large' }),
    runner,
  );
  const viewer = new RepositoryFileViewerService(runner, files);
  const write = (name: string, value: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), value);
  };
  const track = async (name: string, source: 'staged' | 'unstaged' = 'unstaged', scope: 'file' | 'extension' = 'file', ensure = () => {}) => {
    const state = (await lfs.getStatus({ repoPath: root, files: [{ path: name, source }] })).files[0];
    return lfs.track({ repoPath: root, path: name, source, scope, expectedVersion: state.version }, ensure);
  };
  return { root, runner, lfs, files, viewer, write, track };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-lfs-'))
      throw new Error('Unsafe LFS test cleanup');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('Git LFS recommendations', () => {
  it('appends attributes without re-encoding existing bytes', () => {
    const original = Buffer.from([35, 32, 255, 13, 10]);
    const changed = appendLfsRule(original, '"*.psd" filter=lfs diff=lfs merge=lfs -text');
    expect(changed.subarray(0, original.length)).toEqual(original);
    expect(changed.toString()).toContain('-text\r\n');
  });
  it('uses asset and binary thresholds, excluding source, text, configuration and small icons', () => {
    expect(lfsRecommendation('design.PSD', 1024 * 1024, Buffer.from('header'))).toBe('asset');
    for (const extension of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'epub']) {
      expect(lfsRecommendation(`document.${extension}`, 1024 * 1024, Buffer.from('header'))).toBe('asset');
      expect(lfsRecommendation(`document.${extension}`, 1024 * 1024 - 1, Buffer.from([0]))).toBeUndefined();
    }
    expect(lfsRecommendation('icon.png', 1024 * 1024 - 1, Buffer.from([0]))).toBeUndefined();
    expect(lfsRecommendation('data.bin', 10 * 1024 * 1024, Buffer.from([0]))).toBe('binary');
    expect(lfsRecommendation('data.bin', 10 * 1024 * 1024 - 1, Buffer.from([0]))).toBeUndefined();
    for (const name of ['app.ts', 'config.json', 'image.svg', 'pnpm-lock.yaml', '.env.local'])
      expect(lfsRecommendation(name, 100 * 1024 * 1024, Buffer.from([0]))).toBeUndefined();
    expect(lfsRecommendation('unknown', 100 * 1024 * 1024, Buffer.from('plain text'))).toBeUndefined();
    expect(lfsRecommendation('file.psd', 0, Buffer.alloc(0))).toBeUndefined();
  });
  it('does not misclassify UTF-16 text as binary', () => {
    expect(lfsRecommendation('unknown', 10 * 1024 * 1024, Buffer.from([0xff, 0xfe, 65, 0]))).toBeUndefined();
  });
});

describe('safe LFS staging with real Git LFS', () => {
  it('converts a new file in an unborn repository and stages the rule, leaving full working content', async () => {
    const f = fixture();
    const content = Buffer.alloc(1024 * 1024, 42);
    f.write('assets/design.psd', content);
    const before = await f.lfs.getStatus({ repoPath: f.root, files: [{ path: 'assets/design.psd', source: 'unstaged' }] });
    expect(before).toMatchObject({ available: true, files: [{ recommendation: 'asset', configured: false, eligible: true }] });
    await f.track('assets/design.psd');
    const pointer = parseGitLfsPointer(git(f.root, 'show', ':assets/design.psd'));
    expect(pointer?.size).toBe(content.length);
    expect(fs.readFileSync(path.join(f.root, 'assets/design.psd'))).toEqual(content);
    expect(git(f.root, 'show', ':assets/.gitattributes')).toContain('filter=lfs');
    const after = (
      await f.lfs.getStatus({
        repoPath: f.root,
        files: [
          { path: 'assets/design.psd', source: 'staged' },
          { path: 'assets/design.psd', source: 'unstaged' },
        ],
      })
    ).files;
    expect(after.every((file) => file.configured && !file.recommendation)).toBe(true);
  });
  it('preserves partial staging, unrelated index entries and unstaged attributes changes', async () => {
    const f = fixture();
    f.write('file.txt', 'staged content\n');
    f.write('other.txt', 'other staged\n');
    f.write('.gitattributes', '*.other -text\n');
    git(f.root, 'add', '.');
    const otherOid = git(f.root, 'rev-parse', ':other.txt');
    f.write('file.txt', 'working draft\n');
    f.write('.gitattributes', '*.other -text\n*.draft diff=custom\n');
    await f.track('file.txt', 'staged');
    const preview = await f.viewer.getPreview({ repoPath: f.root, path: 'file.txt', source: 'staged' });
    expect(preview).toMatchObject({ kind: 'text', text: 'staged content\n', lfs: { available: true } });
    expect(fs.readFileSync(path.join(f.root, 'file.txt'), 'utf8')).toBe('working draft\n');
    expect(git(f.root, 'rev-parse', ':other.txt')).toBe(otherOid);
    expect(git(f.root, 'show', ':.gitattributes')).not.toContain('*.draft');
    expect(fs.readFileSync(path.join(f.root, '.gitattributes'), 'utf8')).toContain('*.draft');
  });
  it('writes a repository-wide type rule but converts only the selected file', async () => {
    const f = fixture();
    f.write('one.psd', 'one');
    f.write('nested/two.psd', 'two');
    git(f.root, 'add', '.');
    const two = git(f.root, 'rev-parse', ':nested/two.psd');
    await f.track('one.psd', 'staged', 'extension');
    expect(git(f.root, 'rev-parse', ':nested/two.psd')).toBe(two);
    expect(git(f.root, 'check-attr', 'filter', '--', 'nested/two.psd')).toContain('lfs');
    git(f.root, 'add', '--renormalize', '--', 'nested/two.psd');
    expect(parseGitLfsPointer(git(f.root, 'show', ':nested/two.psd'))).not.toBeNull();
  });
  it('escapes spaces, unicode and glob characters as a literal file rule', async () => {
    const f = fixture();
    const name = 'assets/projekt [1] ä.psd';
    f.write(name, 'selected');
    f.write('assets/projekt 1 ä.psd', 'other');
    await f.track(name);
    expect(git(f.root, 'check-attr', 'filter', '--', name)).toContain('lfs');
    expect(git(f.root, 'check-attr', 'filter', '--', 'assets/projekt 1 ä.psd')).toContain('unspecified');
  });
  it('rejects a stale file version, a deleted file and Git control files', async () => {
    const f = fixture();
    f.write('file.bin', 'old');
    const request = { repoPath: f.root, path: 'file.bin', source: 'unstaged' as const, scope: 'file' as const };
    const old = (await f.lfs.getStatus({ ...request, files: [request] })).files[0];
    f.write('file.bin', 'changed');
    await expect(f.lfs.track({ ...request, expectedVersion: old.version }, () => {})).rejects.toThrow(/changed/);
    f.write('.gitattributes', '# original\n');
    expect(
      (
        await f.lfs.getStatus({
          repoPath: f.root,
          files: [
            { path: '.gitattributes', source: 'unstaged' },
            { path: 'deleted', source: 'unstaged' },
          ],
        })
      ).files.every((file) => !file.eligible),
    ).toBe(true);
  });
  it('preserves existing hooks and refuses a busy index without touching attributes', async () => {
    const f = fixture();
    f.write('file.bin', 'data');
    const hook = path.join(f.root, '.git/hooks/pre-push');
    fs.writeFileSync(hook, '#!/bin/sh\nexit 0\n');
    fs.writeFileSync(path.join(f.root, '.git/index.lock'), 'busy');
    await expect(f.track('file.bin')).rejects.toThrow(/busy/);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    expect(fs.readFileSync(hook, 'utf8')).toBe('#!/bin/sh\nexit 0\n');
    expect(fs.readFileSync(path.join(f.root, '.git/index.lock'), 'utf8')).toBe('busy');
  });
  it('detects content changes during preparation and restores attributes on publication failure', async () => {
    const f = fixture();
    f.write('file.txt', 'original');
    let calls = 0;
    await expect(
      f.track('file.txt', 'unstaged', 'file', () => {
        if (++calls === 2) f.write('file.txt', 'external');
      }),
    ).rejects.toThrow(/changed/);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    let publication = 0;
    await expect(
      f.track('file.txt', 'unstaged', 'file', () => {
        if (++publication === 3) throw new Error('publication failed');
      }),
    ).rejects.toThrow('publication failed');
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    expect(git(f.root, 'ls-files')).toBe('');
  });
  it('keeps nested exclusions effective and refuses a type rule that would not apply', async () => {
    const f = fixture();
    f.write('nested/file.psd', 'data');
    f.write('nested/.gitattributes', '*.psd -filter\n');
    git(f.root, 'add', '.');
    await expect(f.track('nested/file.psd', 'staged', 'extension')).rejects.toThrow(/overrides/);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    await f.track('nested/file.psd', 'staged');
    expect(parseGitLfsPointer(git(f.root, 'show', ':nested/file.psd'))).not.toBeNull();
  });
  it('preserves executable modes and renamed staged paths', async () => {
    const f = fixture();
    f.write('old.bin', 'base');
    git(f.root, 'add', '.');
    git(f.root, 'commit', '-m', 'base');
    git(f.root, 'mv', 'old.bin', 'new.bin');
    git(f.root, 'update-index', '--chmod=+x', 'new.bin');
    await f.track('new.bin', 'staged');
    expect(git(f.root, 'ls-files', '--stage', '--', 'new.bin')).toMatch(/^100755 /);
    expect(git(f.root, 'ls-files', '--', 'old.bin')).toBe('');
  });
  it('uses the actual index and shared LFS store in a linked worktree', async () => {
    const f = fixture();
    f.write('base.txt', 'base');
    git(f.root, 'add', '.');
    git(f.root, 'commit', '-m', 'base');
    const worktree = path.join(f.root, 'linked');
    git(f.root, 'worktree', 'add', '-b', 'linked', worktree);
    fs.writeFileSync(path.join(worktree, 'file.bin'), 'linked content');
    const file = { path: 'file.bin', source: 'unstaged' as const };
    const state = (await f.lfs.getStatus({ repoPath: worktree, files: [file] })).files[0];
    await f.lfs.track({ repoPath: worktree, ...file, scope: 'file', expectedVersion: state.version }, () => {});
    expect(parseGitLfsPointer(git(worktree, 'show', ':file.bin'))).not.toBeNull();
    expect(git(f.root, 'ls-files', '--', 'file.bin')).toBe('');
    expect(await f.viewer.getPreview({ repoPath: worktree, path: 'file.bin', source: 'staged' })).toMatchObject({ kind: 'text', text: 'linked content' });
  });
  it('reads original content and hashes, writes LFS pointers from the index editor and keeps commits read-only', async () => {
    const f = fixture();
    f.write('file.txt', 'content');
    await f.track('file.txt');
    const context = { repoPath: f.root, path: 'file.txt', source: 'staged' as const };
    const preview = await f.viewer.getPreview(context);
    expect(preview).toMatchObject({ kind: 'text', text: 'content' });
    expect((await f.viewer.getInfo(context)).hashes?.sha256).toBe(parseGitLfsPointer(git(f.root, 'show', ':file.txt'))?.oid);
    await f.viewer.save({ ...context, content: 'index edit', encoding: 'utf8', expectedVersion: preview.version }, () => {});
    expect(parseGitLfsPointer(git(f.root, 'show', ':file.txt'))).not.toBeNull();
    expect(await f.viewer.getPreview(context)).toMatchObject({ kind: 'text', text: 'index edit' });
    expect(fs.readFileSync(path.join(f.root, 'file.txt'), 'utf8')).toBe('content');
    git(f.root, 'commit', '-m', 'LFS');
    expect(await f.viewer.getPreview({ ...context, source: 'commit', commitHash: git(f.root, 'rev-parse', 'HEAD').trim() })).toMatchObject({
      kind: 'text',
      text: 'index edit',
      editable: false,
    });
  });
  it('explains missing local LFS objects without substituting working content', async () => {
    const f = fixture();
    f.write('file.txt', 'staged content');
    await f.track('file.txt');
    const pointer = parseGitLfsPointer(git(f.root, 'show', ':file.txt'))!;
    const location = await localLfsObject(f.root, pointer, f.runner);
    fs.rmSync(location!);
    f.write('file.txt', 'unrelated working content');
    expect(await f.viewer.getPreview({ repoPath: f.root, path: 'file.txt', source: 'staged' })).toMatchObject({
      kind: 'missing',
      editable: false,
      lfs: { available: false },
    });
  });

  it('resolves Markdown and relative image assets from the selected LFS source and custom storage', async () => {
    const f = fixture();
    git(f.root, 'config', 'lfs.storage', 'custom-lfs');
    f.write('docs/page.md', '![asset](image.png)\n');
    f.write('docs/image.png', Buffer.from([137, 80, 78, 71, 0, 1, 2]));
    await f.track('docs/page.md');
    await f.track('docs/image.png');
    f.write('docs/page.md', 'different working content');
    f.write('docs/image.png', Buffer.from('different working image'));
    expect(await f.files.readRepositoryFileTextAtSource('staged', 'docs/page.md')).toBe('![asset](image.png)\n');
    const image = await f.files.readRepositoryImageDataUrlAtSource('staged', 'docs/image.png');
    expect(image.bytes).toBe(7);
    expect(Buffer.from(image.dataUrl.split(',')[1], 'base64')).toEqual(Buffer.from([137, 80, 78, 71, 0, 1, 2]));
    expect(await f.viewer.getPreview({ repoPath: f.root, path: 'docs/image.png', source: 'staged' })).toMatchObject({
      kind: 'image',
      bytes: 7,
      lfs: { available: true },
    });
  });

  it('keeps recommendations available without the LFS executable and cancels without publishing an index or attributes', async () => {
    const f = fixture();
    f.write('design.psd', Buffer.alloc(1024 * 1024, 1));
    const run = f.runner.run.bind(f.runner);
    const mock = vi
      .spyOn(f.runner, 'run')
      .mockImplementation((cwd, args, options) =>
        args[0] === 'lfs' && args[1] === 'version' ? Promise.reject(new Error('LFS unavailable')) : run(cwd, args, options),
      );
    const status = await f.lfs.getStatus({ repoPath: f.root, files: [{ path: 'design.psd', source: 'unstaged' }] });
    expect(status).toMatchObject({ available: false, files: [{ recommendation: 'asset' }] });
    mock.mockRestore();
    const controller = new AbortController();
    controller.abort();
    await expect(
      f.lfs.track(
        { repoPath: f.root, path: 'design.psd', source: 'unstaged', scope: 'file', expectedVersion: status.files[0].version },
        () => {},
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
    expect(git(f.root, 'ls-files')).toBe('');
  });
});
