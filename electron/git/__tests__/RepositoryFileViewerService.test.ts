import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { RepositoryFiles } from '../RepositoryFiles';
import { RepositoryFileViewerService } from '../RepositoryFileViewerService';
import type { RepositoryFileContextDto, RepositoryFilePreviewDto } from '../../../src/shared/ipc/repositoryFiles';

const fixtures: string[] = [];
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-viewer-'));
  fixtures.push(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Viewer test');
  git(repo, 'config', 'user.email', 'viewer@example.test');
  git(repo, 'config', 'core.autocrlf', 'false');
  const runner = new GitRunner();
  const files = new RepositoryFiles(
    () => repo,
    (cwd, revision, maxBytes) => runner.runBuffer(cwd, ['show', revision], { maxBytes, tooLargeMessage: 'Too large' }),
  );
  const service = new RepositoryFileViewerService(runner, files);
  const write = (name: string, value: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), value);
  };
  const request = (source: RepositoryFileContextDto['source'] = 'staged', filePath = 'file.txt', commitHash?: string): RepositoryFileContextDto => ({
    repoPath: repo,
    source,
    path: filePath,
    commitHash,
  });
  const save = (context: RepositoryFileContextDto, preview: RepositoryFilePreviewDto, content: string, ensure = () => {}) =>
    service.save({ ...context, expectedVersion: preview.version, content, encoding: 'utf8' }, ensure);
  return { repo, runner, files, service, write, request, save };
}
afterEach(() => {
  for (const repo of fixtures.splice(0)) {
    if (path.dirname(path.resolve(repo)) !== path.resolve(os.tmpdir()) || !path.basename(repo).startsWith('ogc-viewer-'))
      throw new Error('Unsafe test cleanup');
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('source-aware file viewer', () => {
  it('reads an untracked file without adding it and detects changed working files before saving', async () => {
    const f = fixture();
    f.write('file.txt', 'new\n');
    const context = f.request('unstaged');
    const preview = await f.service.getPreview(context);
    expect(preview).toMatchObject({ kind: 'text', text: 'new\n', editable: true });
    expect(git(f.repo, 'ls-files')).toBe('');
    f.write('file.txt', 'external\n');
    await expect(f.save(context, preview, 'draft\n')).rejects.toThrow(/changed/);
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8')).toBe('external\n');
  });
  it('atomically saves working content with its encoding and detects a change immediately before rename', async () => {
    const f = fixture();
    f.write('file.txt', Buffer.from([0xff, 0xfe, 0x61, 0, 13, 0, 10, 0]));
    const context = f.request('unstaged');
    const preview = await f.service.getPreview(context);
    expect(preview).toMatchObject({ kind: 'text', encoding: 'utf16le' });
    await f.service.save({ ...context, content: 'ä\r\n', encoding: 'utf16le', expectedVersion: preview.version }, () => {});
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'))).toEqual(Buffer.from([0xff, 0xfe, 0xe4, 0, 13, 0, 10, 0]));
    const next = await f.service.getPreview(context);
    let calls = 0;
    await expect(
      f.save(context, next, 'draft', () => {
        if (++calls === 2) f.write('file.txt', 'external');
      }),
    ).rejects.toThrow(/changed/);
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8')).toBe('external');
  });
  it('updates only the selected index entry, preserving partial staging, other entries and the working file', async () => {
    const f = fixture();
    f.write('file.txt', 'base\n');
    f.write('other.txt', 'base other\n');
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'base');
    f.write('file.txt', 'staged\n');
    f.write('other.txt', 'other staged\n');
    git(f.repo, 'add', '.');
    f.write('file.txt', 'working\n');
    const context = f.request();
    const preview = await f.service.getPreview(context);
    expect(preview).toMatchObject({ kind: 'text', text: 'staged\n', editable: true });
    const other = git(f.repo, 'rev-parse', ':other.txt');
    const saved = await f.save(context, preview, 'index draft\n');
    expect(saved.version).not.toBe(preview.version);
    expect(git(f.repo, 'show', ':file.txt')).toBe('index draft\n');
    expect(git(f.repo, 'rev-parse', ':other.txt')).toBe(other);
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8')).toBe('working\n');
    expect(git(f.repo, 'diff', '--', 'file.txt')).toContain('+working');
  });
  it('allows changes to other index entries while refusing a changed selected entry or HEAD', async () => {
    const f = fixture();
    f.write('file.txt', 'one\n');
    f.write('other.txt', 'two\n');
    git(f.repo, 'add', '.');
    const context = f.request();
    const preview = await f.service.getPreview(context);
    f.write('other.txt', 'three\n');
    git(f.repo, 'add', 'other.txt');
    await f.save(context, preview, 'draft\n');
    expect(git(f.repo, 'show', ':other.txt')).toBe('three\n');
    const next = await f.service.getPreview(context);
    f.write('file.txt', 'external');
    git(f.repo, 'add', 'file.txt');
    await expect(f.save(context, next, 'overwrite')).rejects.toThrow(/changed/);
    const last = await f.service.getPreview(context);
    git(f.repo, 'commit', '-m', 'first');
    await expect(f.save(context, last, 'overwrite')).rejects.toThrow(/changed/);
  });
  it('keeps a busy lock and failed transaction intact', async () => {
    const f = fixture();
    f.write('file.txt', 'staged');
    git(f.repo, 'add', '.');
    const context = f.request();
    const preview = await f.service.getPreview(context);
    const index = path.join(f.repo, '.git', 'index');
    const before = fs.readFileSync(index);
    const lock = `${index}.lock`;
    fs.writeFileSync(lock, 'other operation');
    await expect(f.save(context, preview, 'draft')).rejects.toThrow(/index is busy/);
    expect(fs.readFileSync(lock, 'utf8')).toBe('other operation');
    fs.unlinkSync(lock);
    const input = vi.spyOn(f.runner, 'withExclusiveWrite');
    input.mockImplementationOnce(async (repo, command, work) => {
      input.mockRestore();
      return f.runner.withExclusiveWrite(repo, command, (gitApi) =>
        work({
          ...gitApi,
          input: async () => {
            throw new Error('write failed');
          },
        }),
      );
    });
    await expect(f.save(context, preview, 'draft')).rejects.toThrow('write failed');
    expect(fs.readFileSync(index)).toEqual(before);
    expect(fs.existsSync(lock)).toBe(false);
  });
  it('checks the repository context again before publication without losing staged contents', async () => {
    const f = fixture();
    f.write('file.txt', 'staged');
    git(f.repo, 'add', '.');
    const preview = await f.service.getPreview(f.request());
    let calls = 0;
    await expect(
      f.save(f.request(), preview, 'draft', () => {
        if (++calls > 1) throw new Error('Repository switched');
      }),
    ).rejects.toThrow('Repository switched');
    expect(git(f.repo, 'show', ':file.txt')).toBe('staged');
  });
  it('keeps executable mode, index flags, staged renames and unborn repositories', async () => {
    const f = fixture();
    f.write('file.txt', 'initial');
    git(f.repo, 'add', '.');
    git(f.repo, 'update-index', '--chmod=+x', 'file.txt');
    git(f.repo, 'update-index', '--assume-unchanged', 'file.txt');
    const context = f.request();
    await f.save(context, await f.service.getPreview(context), 'edited');
    expect(git(f.repo, 'ls-files', '-v', '--stage')).toMatch(/^h 100755 /);
    git(f.repo, 'commit', '-m', 'first');
    git(f.repo, 'mv', 'file.txt', 'renamed.txt');
    const renamed = f.request('staged', 'renamed.txt');
    await f.save(renamed, await f.service.getPreview(renamed), 'renamed edit');
    expect(git(f.repo, 'show', ':renamed.txt')).toBe('renamed edit');
    expect(git(f.repo, 'ls-files')).not.toMatch(/^file.txt$/m);
  });
  it('uses the linked worktree index and supports a split index', async () => {
    const f = fixture();
    f.write('file.txt', 'base');
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'base');
    const linked = path.join(f.repo, 'linked');
    git(f.repo, 'worktree', 'add', '-b', 'linked', linked);
    git(linked, 'update-index', '--split-index');
    const context = { ...f.request(), repoPath: linked };
    await f.save(context, await f.service.getPreview(context), 'linked draft');
    expect(git(linked, 'show', ':file.txt')).toBe('linked draft');
    expect(git(f.repo, 'show', ':file.txt')).toBe('base');
  });
  it('reads commit contents and hashes from that version and refuses writes', async () => {
    const f = fixture();
    f.write('file.txt', 'commit content');
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'base');
    const hash = git(f.repo, 'rev-parse', 'HEAD').trim();
    f.write('file.txt', 'working content');
    git(f.repo, 'add', '.');
    const context = f.request('commit', 'file.txt', hash);
    expect(await f.service.getPreview(context)).toMatchObject({ kind: 'text', text: 'commit content', editable: false });
    expect((await f.service.getInfo(context)).hashes.sha256).toBe(createHash('sha256').update('commit content').digest('hex'));
    await expect(f.save(context, await f.service.getPreview(context), 'draft')).rejects.toThrow(/read-only/);
  });
  it('explains missing contents, conflict entries, symlinks and submodules without text editing', async () => {
    const f = fixture();
    f.write('file.txt', 'content');
    git(f.repo, 'add', '.');
    expect(await f.service.getPreview(f.request('staged', 'absent.txt'))).toMatchObject({ kind: 'missing', editable: false });
    const oid = git(f.repo, 'rev-parse', ':file.txt').trim();
    git(f.repo, 'update-index', '--add', '--cacheinfo', `120000,${oid},link.txt`);
    expect(await f.service.getPreview(f.request('staged', 'link.txt'))).toMatchObject({ kind: 'text', editable: false });
    execFileSync('git', ['update-index', '--index-info'], {
      cwd: f.repo,
      input: `0 ${'0'.repeat(40)}\tfile.txt\n100644 ${oid} 1\tfile.txt\n100644 ${oid} 2\tfile.txt\n`,
      windowsHide: true,
    });
    expect(await f.service.getPreview(f.request())).toMatchObject({ kind: 'missing', editable: false, reason: expect.stringMatching(/conflict/) });
  });
});
