import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_NOTES_CHECK_INTERVAL_MS } from '../../../src/shared/userNotes';
import { STORAGE_BUDGETS } from '../../../src/shared/ipc/storageMaintenance';
import { inventoryStorage } from '../storageCatalogue';
import { gitBlob, notesSnapshot, storedNote } from './userNotesFixtures';

vi.mock('electron', () => ({ app: { getPath: vi.fn() }, BrowserWindow: { getAllWindows: () => [] } }));
import { UserNotesManager } from '../UserNotesManager';

describe('persistent user notices', () => {
  let root: string;
  let managers: UserNotesManager[];
  const note = storedNote();
  const snapshotFile = () => path.join(root, 'user-notes-v1.json');
  const create = (synchronize = vi.fn().mockResolvedValue(notesSnapshot([note]))) => {
    const emit = vi.fn();
    const manager = new UserNotesManager({ root, synchronize, emit });
    managers.push(manager);
    return { manager, synchronize, emit };
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-user-notes-'));
    managers = [];
  });
  afterEach(async () => {
    for (const manager of managers) await manager.dispose();
    vi.useRealTimers();
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-user-notes-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('restores acknowledged Markdown and GIFs after restart without network access', async () => {
    const image = gitBlob('GIF89a');
    const illustrated = storedNote('info.md', '# Info\n![Image](image.gif)', {
      'image.gif': { path: '.Open-Git-Control/notes-to-user/image.gif', sha: image.sha },
    });
    const dataUrl = `data:image/gif;base64,${image.content}`;
    const { manager } = create(vi.fn().mockResolvedValue(notesSnapshot([illustrated], { [image.sha]: dataUrl })));
    await expect(manager.check()).resolves.toEqual({ success: true });
    await expect(manager.acknowledge([illustrated])).resolves.toEqual({ success: true });
    const restarted = create();
    expect((await restarted.manager.getStatus()).notes).toMatchObject([{ acknowledged: true }]);
    await expect(restarted.manager.getNote(illustrated)).resolves.toMatchObject({ markdown: illustrated.markdown, images: { 'image.gif': dataUrl } });
    expect(restarted.synchronize).not.toHaveBeenCalled();
    const files = await inventoryStorage(root, []);
    expect(files.filter((entry) => entry.relative.startsWith('user-notes')).map((entry) => entry.managed)).toEqual([false, false]);
  });

  it('does not acknowledge a newer revision or another note that arrived while the popup was open', async () => {
    const { manager, synchronize } = create();
    await manager.check();
    const offered = (await manager.getStatus()).notes;
    const revised = storedNote(note.id, '# Changed');
    synchronize.mockResolvedValue(notesSnapshot([revised, storedNote('new.md', '# New')]));
    await manager.check();
    await manager.acknowledge(offered);
    expect((await manager.getStatus()).notes.map((entry) => entry.acknowledged)).toEqual([false, false]);
    await manager.acknowledge([revised]);
    expect((await manager.getStatus()).notes.map((entry) => entry.acknowledged)).toEqual([true, false]);
  });

  it('preserves acknowledgements written during an in-flight refresh', async () => {
    const { manager, synchronize } = create();
    await manager.check();
    let finish!: (value: ReturnType<typeof notesSnapshot>) => void;
    synchronize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const refresh = manager.check();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await manager.acknowledge([note]);
    finish(notesSnapshot([note, storedNote('new.md', '# New')]));
    await refresh;
    expect((await manager.getStatus()).notes.map((entry) => entry.acknowledged)).toEqual([true, false]);
  });

  it('replaces the snapshot and removes deleted notices, old image data and obsolete acknowledgements', async () => {
    const image = gitBlob('image');
    const illustrated = storedNote('old.md', '# Old', { 'image.png': { path: '.Open-Git-Control/notes-to-user/image.png', sha: image.sha } });
    const { manager, synchronize } = create(vi.fn().mockResolvedValue(notesSnapshot([illustrated], { [image.sha]: `data:image/png;base64,${image.content}` })));
    await manager.check();
    await manager.acknowledge([illustrated]);
    synchronize.mockResolvedValue(notesSnapshot([]));
    await manager.check();
    expect((await manager.getStatus()).notes).toEqual([]);
    expect(JSON.parse(fs.readFileSync(snapshotFile(), 'utf8'))).toMatchObject({ notes: [], assets: {} });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'user-notes-acknowledgements-v1.json'), 'utf8')).revisions).toEqual({});
    expect(fs.readdirSync(root)).toHaveLength(2);
  });

  it('retains the exact last snapshot and confirmation when synchronization fails', async () => {
    const { manager, synchronize } = create();
    await manager.check();
    await manager.acknowledge([note]);
    const saved = fs.readFileSync(snapshotFile(), 'utf8');
    synchronize.mockRejectedValue(new Error('GitHub HTTP 403'));
    await expect(manager.check()).resolves.toEqual({ success: false, error: 'GitHub HTTP 403' });
    expect(fs.readFileSync(snapshotFile(), 'utf8')).toBe(saved);
    expect(await manager.getStatus()).toMatchObject({ state: 'error', notes: [{ acknowledged: true }] });
  });

  it('stops automatic startup and periodic checks while preserving manual checks', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { manager, synchronize } = create();
    manager.setChecksEnabled(false);
    await manager.getStatus();
    await vi.advanceTimersByTimeAsync(USER_NOTES_CHECK_INTERVAL_MS);
    expect(synchronize).not.toHaveBeenCalled();
    manager.setChecksEnabled(true);
    await vi.waitFor(() => expect(synchronize).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect((await manager.getStatus()).state).toBe('ready'));
    await vi.advanceTimersByTimeAsync(USER_NOTES_CHECK_INTERVAL_MS);
    await vi.waitFor(async () => expect((await manager.getStatus()).state).toBe('ready'));
    expect(synchronize).toHaveBeenCalledTimes(2);
    manager.setChecksEnabled(false);
    await vi.advanceTimersByTimeAsync(USER_NOTES_CHECK_INTERVAL_MS);
    expect(synchronize).toHaveBeenCalledTimes(2);
    await manager.check();
    expect(synchronize).toHaveBeenCalledTimes(3);
  });

  it('aborts an active check when disabled without changing the stored collection', async () => {
    const { manager, synchronize } = create();
    await manager.check();
    synchronize.mockImplementation(
      (_snapshot, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const running = manager.check();
    await vi.waitFor(() => expect(synchronize).toHaveBeenCalledTimes(2));
    manager.setChecksEnabled(false);
    await running;
    expect(await manager.getStatus()).toMatchObject({ state: 'ready', error: null, notes: [{ id: note.id }] });
  });

  it('deduplicates concurrent checks and rejects forged acknowledgements and paths', async () => {
    const { manager, synchronize } = create();
    await Promise.all([manager.check(), manager.check(), manager.check()]);
    expect(synchronize).toHaveBeenCalledTimes(1);
    await expect(manager.acknowledge([{ id: '../outside.md', revision: note.revision }])).resolves.toMatchObject({ success: false });
    await expect(manager.acknowledge(null as never)).resolves.toMatchObject({ success: false });
    await expect(manager.getNote({ id: '../outside.md', revision: note.revision })).rejects.toThrow('Invalid');
    await expect(manager.getNote({ id: note.id, revision: 'f'.repeat(64) })).rejects.toThrow('no longer available');
  });

  it('preserves unsupported cache and acknowledgement formats', async () => {
    const foreign = '{"version":99,"future":"preserve"}';
    fs.writeFileSync(snapshotFile(), foreign);
    const { manager } = create();
    expect((await manager.getStatus()).state).toBe('error');
    await expect(manager.check()).resolves.toMatchObject({ success: false });
    expect(fs.readFileSync(snapshotFile(), 'utf8')).toBe(foreign);
    fs.writeFileSync(path.join(root, 'user-notes-acknowledgements-v1.json'), foreign);
    await expect(manager.acknowledge([])).resolves.toMatchObject({ success: false });
    expect(fs.readFileSync(path.join(root, 'user-notes-acknowledgements-v1.json'), 'utf8')).toBe(foreign);
  });

  it('enforces the shared auxiliary quota without losing an earlier snapshot', async () => {
    const { manager, synchronize } = create();
    await manager.check();
    const saved = fs.readFileSync(snapshotFile(), 'utf8');
    fs.mkdirSync(path.join(root, 'GPUCache'));
    const file = fs.openSync(path.join(root, 'GPUCache', 'budget'), 'wx');
    fs.ftruncateSync(file, STORAGE_BUDGETS.auxiliary);
    fs.closeSync(file);
    synchronize.mockResolvedValue(notesSnapshot([storedNote('new.md', '# New')]));
    await expect(manager.check()).resolves.toMatchObject({ success: false, error: expect.stringContaining('budget') });
    expect(fs.readFileSync(snapshotFile(), 'utf8')).toBe(saved);
    expect((await manager.getStatus()).notes[0].id).toBe(note.id);
  });
});
