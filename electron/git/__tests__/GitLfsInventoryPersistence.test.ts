import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, vi } from 'vitest';
import { inventoryTest, lfsPointer, pointerText, pointers } from './lfsInventoryFixture';
import { isLfsInventoryDocument, lfsInventoryDocument, LFS_INVENTORY_DIRECTORY } from '../GitLfsInventoryFormat';
import { GitLfsInventoryStore } from '../GitLfsInventoryStore';
import { RemoteTransferService } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';

const cacheFile = (profile: string) => path.join(profile, LFS_INVENTORY_DIRECTORY, fs.readdirSync(path.join(profile, LFS_INVENTORY_DIRECTORY))[0]);

describe('persistent and cancellable LFS inventories', () => {
  inventoryTest('restores an inventory after restart and extends it without rereading old blobs', async (f) => {
    const a = lfsPointer('first persisted'),
      b = lfsPointer('next persisted');
    const head = await f.commit({ 'a.bin': pointerText(a), plain: 'ordinary content\n' });
    expect(await f.read([head], f.newInventory(true))).toEqual([a]);
    const file = cacheFile(f.profile);
    const before = fs.readFileSync(file, 'utf8');
    expect(isLfsInventoryDocument(JSON.parse(before))).toBe(true);
    const restarted = f.newInventory(true);
    f.inspect.mockClear();
    expect(await f.read([head], restarted)).toEqual([a]);
    expect(f.objectWalks()).toEqual([]);
    expect(f.blobReads()).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    const updated = await f.commit({ 'b.bin': pointerText(b) });
    const newBlob = await f.git('rev-parse', 'HEAD:b.bin');
    f.inspect.mockClear();
    expect(await f.read([updated], restarted)).toEqual(pointers(a, b));
    expect(f.blobReads()).toEqual([newBlob]);
    expect(String(f.objectWalks()[0][2]?.input)).toBe(`${updated}\n^${head}\n`);
    expect(await f.read([updated], f.newInventory(true))).toEqual(pointers(a, b));
  });

  for (const damage of ['truncated', 'wrong checksum', 'wrong namespace']) {
    inventoryTest(`rescans instead of trusting a ${damage} cache`, async (f) => {
      const a = lfsPointer('must still be uploaded');
      const head = await f.commit({ 'a.bin': pointerText(a) });
      await f.read([head], f.newInventory(true));
      const file = cacheFile(f.profile);
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (damage === 'truncated') fs.writeFileSync(file, '{"version":1,');
      else if (damage === 'wrong checksum') {
        stored.snapshots[0].pointers = [];
        fs.writeFileSync(file, JSON.stringify(stored));
      } else {
        const { checksum: _checksum, ...payload } = stored;
        fs.writeFileSync(file, JSON.stringify(lfsInventoryDocument({ ...payload, namespace: 'b'.repeat(64) })));
      }
      f.inspect.mockClear();
      expect(await f.read([head], f.newInventory(true))).toEqual([a]);
      expect(f.objectWalks()).toHaveLength(1);
      expect(isLfsInventoryDocument(JSON.parse(fs.readFileSync(file, 'utf8')))).toBe(true);
      if (damage === 'wrong namespace') expect(JSON.parse(fs.readFileSync(file, 'utf8')).namespace).toBe('b'.repeat(64));
    });
  }

  inventoryTest('preserves a future cache format while still producing a fresh correct inventory', async (f) => {
    const a = lfsPointer('future version fallback');
    const head = await f.commit({ 'a.bin': pointerText(a) });
    await f.read([head], f.newInventory(true));
    const file = cacheFile(f.profile),
      future = '{"version":999,"data":"preserve"}';
    fs.writeFileSync(file, future);
    f.inspect.mockClear();
    expect(await f.read([head], f.newInventory(true))).toEqual([a]);
    expect(f.objectWalks()).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).toBe(future);
  });

  inventoryTest('never follows a redirected cache directory', async (f) => {
    const a = lfsPointer('redirect fallback');
    const head = await f.commit({ 'a.bin': pointerText(a) });
    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(f.profile);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'preserve');
    fs.symlinkSync(outside, path.join(f.profile, LFS_INVENTORY_DIRECTORY), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await f.read([head], f.newInventory(true))).toEqual([a]);
    expect(fs.readdirSync(outside)).toEqual(['sentinel']);
  });

  inventoryTest('does not replace a cache file modified by another writer after loading', async (f) => {
    const a = lfsPointer('external writer');
    const head = await f.commit({ 'a.bin': pointerText(a) });
    await f.read([head], f.newInventory(true));
    const file = cacheFile(f.profile);
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    const store = new GitLfsInventoryStore(() => f.profile, document.namespace);
    await store.load();
    fs.writeFileSync(file, '{"version":999,"external":true}');
    await store.save(document);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"version":999,"external":true}');
  });

  inventoryTest('does not publish a partial inventory when a later blob batch is cancelled', async (f) => {
    const values = Array.from({ length: 300 }, (_, index) => lfsPointer(`object ${index}`));
    const head = await f.commit(Object.fromEntries(values.map((pointer, index) => [`files/${index}.bin`, pointerText(pointer)])));
    const cache = f.newInventory(true),
      controller = new AbortController();
    const run = f.runBuffer;
    let batches = 0;
    f.inspect.mockImplementation(async (cwd, args, options) => {
      if (args[1] === '--batch' && ++batches === 2) controller.abort();
      return run(cwd, args, options);
    });
    await expect(f.read([head], cache, f.repo, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    f.inspect.mockRestore();
    expect(await f.read([head], cache)).toEqual(pointers(...values));
    expect(await f.read([head], f.newInventory(true))).toEqual(pointers(...values));
  });

  inventoryTest('cancels queued callers immediately without cancelling another caller or starting duplicate scans', async (f) => {
    const a = lfsPointer('concurrent inventory');
    const head = await f.commit({ 'a.bin': pointerText(a) });
    const run = f.runBuffer;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    f.inspect.mockImplementation(async (cwd, args, options) => {
      if (args.includes('--objects')) {
        started = true;
        await gate;
      }
      return run(cwd, args, options);
    });
    const first = f.read([head]);
    try {
      await vi.waitFor(() => expect(started).toBe(true));
      const controller = new AbortController();
      const cancelled = f.read([head], f.inventory, f.repo, controller.signal);
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
      const concurrent = f.read([head]);
      release();
      expect(await first).toEqual([a]);
      expect(await concurrent).toEqual([a]);
      expect(f.objectWalks()).toHaveLength(1);
    } finally {
      release();
      await first;
    }
  });

  inventoryTest('rejects a history boundary change during inspection and starts the next inventory afresh', async (f) => {
    const a = lfsPointer('historical'),
      b = lfsPointer('visible');
    await f.commit({ 'old.bin': pointerText(a) });
    const head = await f.commit({ 'old.bin': null, 'new.bin': pointerText(b) });
    const run = f.runBuffer;
    f.inspect.mockImplementation(async (cwd, args, options) => {
      const result = await run(cwd, args, options);
      if (args[1] === '--batch') fs.writeFileSync(path.join(f.repo, '.git', 'shallow'), `${head}\n`);
      return result;
    });
    await expect(f.read([head])).rejects.toThrow('history changed');
    f.inspect.mockRestore();
    expect(await f.read([head])).toEqual([b]);
  });

  inventoryTest('reuses inventories through the actual push planner for a new plan and a new commit', async (f) => {
    const endpoint = path.join(f.root, 'remote.git');
    await f.lifecycle.git(f.root, 'init', '--bare', endpoint);
    await f.git('remote', 'add', 'origin', endpoint);
    const service = new RemoteTransferService(f.runner, new RemotePreferencesStore(() => path.join(f.profile, 'remotes.json')));
    const context = { ownerId: 1, generation: 0, signal: f.lifecycle.signal, ensureActive: () => f.lifecycle.signal.throwIfAborted() };
    const head = await f.commit({ plain: 'normal source\n' });
    const first = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'] }, context);
    expect(first.sourceOid).toBe(head);
    expect(first.lfsObjects).toBeUndefined();
    f.inspect.mockClear();
    const second = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'] }, context);
    expect(second.id).not.toBe(first.id);
    expect(f.objectWalks()).toEqual([]);
    expect(f.blobReads()).toEqual([]);
    const changed = await f.commit({ 'new-file': 'new source\n' });
    f.inspect.mockClear();
    const third = await service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'] }, context);
    expect(third.sourceOid).toBe(changed);
    expect(f.objectWalks()).toHaveLength(1);
    expect(String(f.objectWalks()[0][2]?.input)).toBe(`${changed}\n^${head}\n`);
  });

  inventoryTest('bounds retained snapshots while preserving blob classifications for evicted roots', async (f) => {
    const a = lfsPointer('retained pointer');
    const first = await f.commit({ 'asset.bin': pointerText(a) });
    const cache = f.newInventory(true);
    await f.read([first], cache);
    for (let index = 0; index < 17; index++) {
      const head = await f.commit({ 'source.txt': `revision ${index}\n` });
      expect(await f.read([head], cache)).toEqual([a]);
    }
    const document = JSON.parse(fs.readFileSync(cacheFile(f.profile), 'utf8'));
    expect(document.snapshots).toHaveLength(16);
    expect(document.snapshots.some((snapshot: { root: string }) => snapshot.root === first)).toBe(false);
    f.inspect.mockClear();
    expect(await f.read([first], cache)).toEqual([a]);
    expect(f.blobReads()).toEqual([]);
  });

  inventoryTest('keeps a known pointer when newer objects evict it from the LRU within the same batch', async (f) => {
    const a = lfsPointer('must survive in-flight eviction');
    const head = await f.commit({ 'asset.bin': pointerText(a) });
    const blob = await f.git('rev-parse', 'HEAD:asset.bin');
    await f.read([head], f.newInventory(true));
    const file = cacheFile(f.profile);
    const { checksum: _checksum, ...payload } = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Simulate a full classification cache whose old histories were pruned.
    // The selected blob is the oldest entry but remains part of this batch.
    payload.objects = [[blob, a], ...Array.from({ length: 74_999 }, (_, index) => [(index + 1).toString(16).padStart(40, '0'), null])];
    payload.snapshots = [];
    fs.writeFileSync(file, JSON.stringify(lfsInventoryDocument(payload)));
    expect(await f.read([head], f.newInventory(true))).toEqual([a]);
  });
});
