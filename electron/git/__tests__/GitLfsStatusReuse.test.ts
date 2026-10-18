import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectLfsFiles } from '../GitLfsInspection';
import { lfsStatusFixture } from './lfsStatusFixture';

let f: ReturnType<typeof lfsStatusFixture>;
beforeEach(() => {
  f = lfsStatusFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  f.cleanup();
});
const staged = (path: string) => ({ path, source: 'staged' as const });
const unstaged = (path: string) => ({ path, source: 'unstaged' as const });
const calls = (name: string) => f.reader.run.mock.calls.filter(([, args]) => args[0] === name);

describe('incremental LFS staging previews', () => {
  it('reuses 400 distinct large staged blob classifications and only samples the newly staged blob', async () => {
    const files = Array.from({ length: 400 }, (_, index) => staged(`asset-${index}.bin`));
    for (const [index, file] of files.entries()) f.stage(file.path, f.blob(Buffer.from([0, index % 255]), 12 * 1024 * 1024));
    const initial = await f.status(files);
    expect(initial.files.every((file) => file.recommendation === 'binary')).toBe(true);
    expect(f.reader.prefix).toHaveBeenCalledTimes(400);
    const unchanged = await f.status([...files]);
    expect(unchanged).toEqual(initial);
    expect(f.reader.prefix).toHaveBeenCalledTimes(400);
    expect(calls('lfs')).toHaveLength(1);
    expect(calls('ls-files')).toHaveLength(1);
    const next = staged('new.psd');
    f.stage(next.path, f.blob('another blob', 11 * 1024 * 1024));
    const extended = await f.status([...files, next]);
    expect(f.reader.prefix).toHaveBeenCalledTimes(401);
    expect(calls('ls-files')).toHaveLength(2);
    expect(extended.files.slice(0, 400)).toEqual(initial.files);
    expect(extended.files[400].recommendation).toBe('asset');
  }, 30000);

  it('reads only the changed working file again, including same-size edits with a restored mtime', async () => {
    const files = Array.from({ length: 40 }, (_, index) => unstaged(`file-${index}.bin`));
    for (const file of files) f.write(file.path, 'original');
    const open = vi.spyOn(fs.promises, 'open');
    const initial = await f.status(files);
    expect(open).toHaveBeenCalledTimes(40);
    await f.status([...files]);
    expect(open).toHaveBeenCalledTimes(40);
    const target = path.join(f.root, files[3].path),
      old = fs.statSync(target);
    // Atomic replacement gives a new file identity even on low-resolution filesystems.
    const replacement = f.write('replacement', 'modified');
    fs.utimesSync(replacement, old.atime, old.mtime);
    fs.renameSync(replacement, target);
    const current = await f.status(files);
    expect(open).toHaveBeenCalledTimes(41);
    expect(current.files[3].version).not.toBe(initial.files[3].version);
    expect(current.files.filter((file, index) => file.version === initial.files[index].version)).toHaveLength(39);
  });

  it('keeps staged and working versions separate when only the working copy changes', async () => {
    f.stage('design.psd', f.blob('staged'));
    f.write('design.psd', 'working');
    const files = [staged('design.psd'), unstaged('design.psd')];
    const before = await f.status(files);
    f.write('design.psd', 'new working content');
    const after = await f.status(files);
    expect(after.files[0]).toEqual(before.files[0]);
    expect(after.files[1].version).not.toBe(before.files[1].version);
    expect(f.reader.prefix).toHaveBeenCalledTimes(1);
  });

  it('invalidates attribute state only for affected paths while reusing their content probes', async () => {
    const files = [staged('one/file.psd'), staged('two/file.psd')];
    for (const file of files) f.stage(file.path, f.blob(file.path));
    const before = await f.status(files);
    f.stage('one/.gitattributes', f.blob('*.psd filter=lfs\n'));
    f.write('one/.gitattributes', '*.psd filter=lfs\n');
    f.working.set(files[0].path, 'lfs');
    f.cached.set(files[0].path, 'lfs');
    const after = await f.status(files);
    expect(after.files[0]).toMatchObject({ configured: true, needsRestage: true });
    expect(after.files[0].version).not.toBe(before.files[0].version);
    expect(after.files[1]).toEqual(before.files[1]);
    expect(f.reader.prefix).toHaveBeenCalledTimes(1); // Both small blobs were initially read in one batch.
  });

  it('still checks effective global/info attributes, configuration, branch and HEAD on a warm cache', async () => {
    const file = staged('file.psd');
    f.stage(file.path, f.blob('file'));
    const initial = (await f.status([file])).files[0];
    f.cached.set(file.path, 'lfs'); // Effective attributes can change outside the worktree.
    const configured = (await f.status([file])).files[0];
    expect(configured.configured).toBe(true);
    expect(configured.version).not.toBe(initial.version);
    f.context.config = 'core.filemode false';
    const config = (await f.status([file])).files[0];
    expect(config.version).not.toBe(configured.version);
    f.context.branch = 'refs/heads/other';
    const branch = (await f.status([file])).files[0];
    expect(branch.version).not.toBe(config.version);
    f.context.head = 'b'.repeat(40);
    expect((await f.status([file])).files[0].version).not.toBe(branch.version);
    expect(f.reader.prefix).toHaveBeenCalledTimes(1);
  });

  it('invalidates replacement-object samples, reports missing blobs and recovers without caching read errors', async () => {
    const file = staged('file.bin'),
      oid = f.blob('first');
    f.stage(file.path, oid);
    const initial = (await f.status([file])).files[0];
    f.context.replacements = `refs/replace/${oid} ${'b'.repeat(40)}`;
    f.objects.set(oid, { bytes: 5, sample: Buffer.from('other') });
    const replaced = (await f.status([file])).files[0];
    expect(replaced.version).not.toBe(initial.version);
    expect(f.reader.prefix).toHaveBeenCalledTimes(2);
    f.objects.delete(oid);
    expect((await f.status([file])).files[0]).toMatchObject({ eligible: false });
    f.context.replacements = '';
    f.objects.set(oid, { bytes: 5, sample: Buffer.from('first') });
    expect((await f.status([file])).files[0]).toEqual(initial);
  });

  it('uses fresh content in the mutation guard even if a preview classification is already cached', async () => {
    const file = staged('file.bin'),
      oid = f.blob('first');
    f.stage(file.path, oid);
    const initial = (await f.status([file])).files[0];
    // Simulate a corrupted/replaced object not reflected in normal Git identities.
    f.objects.set(oid, { bytes: 5, sample: Buffer.from('other') });
    expect((await f.status([file])).files[0]).toEqual(initial);
    await expect(f.service.track({ repoPath: f.root, ...file, scope: 'file', expectedVersion: initial.version }, () => {})).rejects.toThrow(/changed/);
    expect(f.reader.prefix).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(path.join(f.root, '.gitattributes'))).toBe(false);
  });

  it('has identical fresh and cached version semantics, including partial staging and pointer files', async () => {
    const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${'c'.repeat(64)}\nsize 123456\n`;
    f.stage('file.psd', f.blob(pointer));
    f.write('file.psd', 'working draft');
    const files = [staged('file.psd'), unstaged('file.psd')];
    const preview = await f.status(files);
    const fresh = await inspectLfsFiles(f.root, files, f.reader);
    expect(preview.files).toEqual(fresh.map((file) => file.state));
    expect(preview.files[0]).toMatchObject({ pointer: true, bytes: 123456 });
  });
});
