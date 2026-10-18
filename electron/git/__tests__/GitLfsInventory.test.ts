import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect } from 'vitest';
import { inventoryTest, lfsPointer, pointerText, pointers } from './lfsInventoryFixture';

describe('incremental LFS history inventory with real Git', () => {
  inventoryTest('reuses complete roots and inspects only new blobs after a commit, including negative results', async (f) => {
    const a = lfsPointer('first LFS object'),
      b = lfsPointer('second LFS object');
    const first = await f.commit({ 'asset.bin': pointerText(a), 'plain.txt': 'Not a pointer\n' });
    const oldPointerBlob = await f.git('rev-parse', 'HEAD:asset.bin');
    const oldPlainBlob = await f.git('rev-parse', 'HEAD:plain.txt');
    expect(await f.read([first])).toEqual([a]);
    expect(f.objectWalks()).toHaveLength(1);
    expect(f.blobReads()).toContain(oldPlainBlob);
    f.inspect.mockClear();
    expect(await f.read([first])).toEqual([a]);
    expect(f.objectWalks()).toHaveLength(0);
    expect(f.blobReads()).toEqual([]);

    const second = await f.commit({ 'asset.bin': null, 'copy of plain.txt': 'Not a pointer\n', 'new.bin': pointerText(b) });
    const newBlob = await f.git('rev-parse', 'HEAD:new.bin');
    f.inspect.mockClear();
    expect(await f.read([second])).toEqual(pointers(a, b));
    expect(f.objectWalks()).toHaveLength(1);
    expect(String(f.objectWalks()[0][2]?.input)).toBe(`${second}\n^${first}\n`);
    expect(f.blobReads()).toEqual([newBlob]);
    expect(f.blobReads()).not.toContain(oldPointerBlob);
    expect(f.blobReads()).not.toContain(oldPlainBlob);
  });

  inventoryTest('does not seed unrelated snapshots or suppress a reused pointer from another branch', async (f) => {
    const basePointer = lfsPointer('base LFS'),
      reused = lfsPointer('reused LFS'),
      unrelated = lfsPointer('unrelated LFS');
    const main = await f.commit({ 'main.bin': pointerText(basePointer) });
    await f.read([main]);
    await f.git('checkout', '-b', 'unrelated', f.base);
    const other = await f.commit({ 'reused.bin': pointerText(reused), 'private.bin': pointerText(unrelated) });
    await f.read([other]);
    await f.git('checkout', 'main');
    const updated = await f.commit({ 'copied.bin': pointerText(reused) });
    f.inspect.mockClear();
    expect(await f.read([updated])).toEqual(pointers(basePointer, reused));
    expect(String(f.objectWalks()[0][2]?.input)).toBe(`${updated}\n^${main}\n`);
    expect(f.blobReads()).toEqual([]);
  });

  for (const cachedSide of [false, true]) {
    inventoryTest(`includes both merge histories (side previously cached: ${cachedSide})`, async (f) => {
      const a = lfsPointer('main asset'),
        b = lfsPointer('side asset');
      const main = await f.commit({ 'main.bin': pointerText(a) });
      await f.read([main]);
      await f.git('checkout', '-b', 'side', f.base);
      const side = await f.commit({ 'side.bin': pointerText(b) });
      const sideBlob = await f.git('rev-parse', 'HEAD:side.bin');
      if (cachedSide) await f.read([side]);
      await f.git('checkout', 'main');
      await f.git('merge', '--no-ff', '--no-edit', 'side');
      const merged = await f.git('rev-parse', 'HEAD');
      f.inspect.mockClear();
      expect(await f.read([merged])).toEqual(pointers(a, b));
      if (cachedSide) expect(f.blobReads()).toEqual([]);
      else expect(f.blobReads()).toEqual([sideBlob]);
    });
  }

  inventoryTest('handles rewritten branches and old annotated tags without leaking newer history', async (f) => {
    const a = lfsPointer('old release'),
      b = lfsPointer('later release'),
      c = lfsPointer('rewritten history');
    const first = await f.commit({ 'old.bin': pointerText(a) });
    await f.git('tag', '-a', 'old-release', '-m', 'Old release');
    const tag = await f.git('rev-parse', 'refs/tags/old-release');
    const second = await f.commit({ 'later.bin': pointerText(b) });
    expect(await f.read([second, tag])).toEqual(pointers(a, b));
    expect(await f.read([tag])).toEqual([a]);
    await f.git('reset', '--hard', f.base);
    const rewritten = await f.commit({ 'new.bin': pointerText(c) });
    expect(await f.read([rewritten])).toEqual([c]);
    expect(await f.read([rewritten, tag])).toEqual(pointers(a, c));
    expect(await f.read([first])).toEqual([a]);
  });

  inventoryTest('supports tags of trees and blobs and deduplicates their LFS objects', async (f) => {
    const a = lfsPointer('tree content');
    const head = await f.commit({ 'asset.bin': pointerText(a), normal: 'plain\n' });
    const tree = await f.git('rev-parse', 'HEAD^{tree}');
    const blob = await f.git('rev-parse', 'HEAD:asset.bin');
    await f.git('tag', '-a', 'blob-tag', '-m', 'Blob', blob);
    const tag = await f.git('rev-parse', 'refs/tags/blob-tag');
    expect(await f.read([tree, tag, head, blob])).toEqual([a]);
    f.inspect.mockClear();
    expect(await f.read([tag])).toEqual([a]);
    expect(f.objectWalks()).toEqual([]);
  });

  inventoryTest('invalidates shallow snapshots after deepening, including across an app restart', async (f) => {
    const a = lfsPointer('hidden older content'),
      b = lfsPointer('shallow tip');
    await f.commit({ 'old.bin': pointerText(a) });
    const tip = await f.commit({ 'old.bin': null, 'tip.bin': pointerText(b) });
    const clone = path.join(f.root, 'shallow');
    await f.lifecycle.git(f.root, 'clone', '--depth=1', pathToFileURL(f.repo).href, clone);
    expect(await f.read([tip], f.newInventory(true), clone)).toEqual([b]);
    await f.lifecycle.git(clone, 'fetch', '--unshallow', 'origin');
    f.inspect.mockClear();
    expect(await f.read([tip], f.newInventory(true), clone)).toEqual(pointers(a, b));
    expect(String(f.objectWalks()[0][2]?.input)).toBe(`${tip}\n`);
  });

  inventoryTest('shares complete inventories between linked worktrees', async (f) => {
    const a = lfsPointer('worktree asset');
    const head = await f.commit({ 'asset.bin': pointerText(a) });
    const cache = f.newInventory(true);
    expect(await f.read([head], cache)).toEqual([a]);
    const linked = path.join(f.root, 'linked');
    await f.git('worktree', 'add', '-b', 'linked', linked);
    f.inspect.mockClear();
    expect(await f.read([head], cache, linked)).toEqual([a]);
    expect(f.objectWalks()).toEqual([]);
    expect(fs.readdirSync(path.join(f.profile, 'lfs-inventory-v1'))).toHaveLength(1);
  });

  inventoryTest('drops unavailable cached bases after branch deletion and garbage collection', async (f) => {
    const a = lfsPointer('unreachable'),
      b = lfsPointer('current');
    const old = await f.commit({ 'old.bin': pointerText(a) });
    await f.read([old]);
    await f.git('reset', '--hard', f.base);
    const head = await f.commit({ 'new.bin': pointerText(b) });
    await f.git('reflog', 'expire', '--expire=now', '--all');
    await f.git('gc', '--prune=now');
    f.inspect.mockClear();
    expect(await f.read([head])).toEqual([b]);
    expect(String(f.objectWalks()[0][2]?.input)).toBe(`${head}\n`);
  });

  inventoryTest('inspects immutable source blobs even when replacement objects are configured', async (f) => {
    const a = lfsPointer('original pointer');
    const head = await f.commit({ 'asset.bin': pointerText(a), plain: 'replacement\n' });
    const blob = await f.git('rev-parse', 'HEAD:asset.bin');
    const replacement = await f.git('rev-parse', 'HEAD:plain');
    await f.git('replace', blob, replacement);
    expect(await f.runner.run(f.repo, ['cat-file', '-p', blob], { envOverrides: { GIT_NO_REPLACE_OBJECTS: undefined } })).toBe('replacement');
    expect(await f.read([head])).toEqual([a]);
    await f.git('replace', '-d', blob);
    f.inspect.mockClear();
    expect(await f.read([head])).toEqual([a]);
    expect(f.objectWalks()).toEqual([]);
  });

  inventoryTest('reuses empty inventories for repositories without LFS', async (f) => {
    const head = await f.commit({ 'small.txt': 'ordinary small text\n', 'large.txt': 'not a pointer'.repeat(1000) });
    expect(await f.read([head])).toEqual([]);
    f.inspect.mockClear();
    expect(await f.read([head])).toEqual([]);
    expect(f.objectWalks()).toEqual([]);
    expect(f.blobReads()).toEqual([]);
  });

  inventoryTest('supports SHA-256 Git object identities as well as SHA-256 LFS identities', async (f) => {
    const repo = path.join(f.root, 'sha256');
    const git = (...args: string[]) => f.lifecycle.git(repo, ...args);
    await f.lifecycle.git(f.root, 'init', '--object-format=sha256', repo);
    await git('config', 'user.name', 'LFS SHA256');
    await git('config', 'user.email', 'sha256@example.test');
    await git('config', 'commit.gpgsign', 'false');
    const a = lfsPointer('sha256 repository asset');
    fs.writeFileSync(path.join(repo, 'asset.bin'), pointerText(a));
    await git('add', '.');
    await git('commit', '-m', 'SHA256 source');
    const head = await git('rev-parse', 'HEAD');
    expect(head).toHaveLength(64);
    expect(await f.read([head], f.inventory, repo)).toEqual([a]);
    f.inspect.mockClear();
    expect(await f.read([head], f.inventory, repo)).toEqual([a]);
    expect(f.objectWalks()).toEqual([]);
  });
});
