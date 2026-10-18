import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SNAPSHOT_BYTES, type ResourceKey } from '@/shared/cache/resource';
import { createPreviewPersistence } from '../previewPersistence';

const key: ResourceKey = ['resource', 'git', 'C:/repo', 'getCommitLogPage', { offset: 0, limit: 100, scope: 'head' }];
describe('batched preview persistence', () => {
  let client: QueryClient;
  let persistence: ReturnType<typeof createPreviewPersistence>;
  const save = vi.fn<(batch: unknown[]) => Promise<void>>();
  let serialize: ReturnType<typeof vi.spyOn<typeof JSON, 'stringify'>>;
  const snapshotsSerialized = () => serialize.mock.calls.filter(([value]) => value?.version === 1 && Array.isArray(value?.key));
  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    save.mockReset().mockResolvedValue(undefined);
    persistence = createPreviewPersistence(client.getQueryCache(), save, Date.now() - 1);
    serialize = vi.spyOn(JSON, 'stringify');
  });
  afterEach(() => {
    persistence.dispose();
    client.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('serializes only the latest of 100 successful updates when the save window ends', async () => {
    for (let version = 0; version < 100; version++) client.setQueryData(key, { success: true, data: { head: `head-${version}`, version } });
    expect(snapshotsSerialized()).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299);
    expect(snapshotsSerialized()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshotsSerialized()).toHaveLength(1);
    expect(save).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ key, sourceRevision: 'head-99', data: { success: true, data: { head: 'head-99', version: 99 } } }),
    ]);
  });

  it('persists distinct keys in one batch and keeps their final timestamps and revisions', async () => {
    const status: ResourceKey = ['resource', 'git', 'C:/other', 'getWorkingTreeSnapshot', 'C:/other'];
    client.setQueryData(key, { data: { head: 'first' } });
    client.setQueryData(status, { data: { snapshotId: 'snapshot' } });
    await vi.advanceTimersByTimeAsync(100);
    client.setQueryData(key, { data: { head: 'last' } });
    const updatedAt = Date.now();
    await vi.advanceTimersByTimeAsync(200);
    expect(snapshotsSerialized()).toHaveLength(2);
    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([
        expect.objectContaining({ key, savedAt: updatedAt, sourceRevision: 'last' }),
        expect.objectContaining({ key: status, sourceRevision: 'snapshot' }),
      ]),
    );
  });

  it('can flush immediately on pagehide or visibility changes without saving twice', async () => {
    client.setQueryData(key, { data: { head: 'latest' } });
    persistence.flush();
    expect(snapshotsSerialized()).toHaveLength(1);
    expect(save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    persistence.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not serialize obsolete oversized intermediate data', async () => {
    client.setQueryData(key, 'x'.repeat(MAX_SNAPSHOT_BYTES + 1));
    client.setQueryData(key, { data: { head: 'small' } });
    await vi.advanceTimersByTimeAsync(300);
    expect(snapshotsSerialized()).toHaveLength(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it.each(['unicode', 'envelope'] as const)('enforces the full snapshot byte limit for %s data', async (kind) => {
    const target: ResourceKey = kind === 'envelope' ? ['resource', 'planner', 'x'.repeat(1000), 'getData'] : key;
    const data = kind === 'unicode' ? '\u00e4'.repeat(MAX_SNAPSHOT_BYTES / 2) : 'x'.repeat(MAX_SNAPSHOT_BYTES - 500);
    client.setQueryData(target, data);
    await vi.advanceTimersByTimeAsync(300);
    expect(snapshotsSerialized()).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('skips malformed previews without blocking other keys', async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    client.setQueryData(key, cyclic);
    const valid: ResourceKey = ['resource', 'planner', 'application', 'getData'];
    client.setQueryData(valid, { version: 'valid' });
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ key: valid })]);
  });

  it.each(['remove', 'invalidate'] as const)('discards a preview when its query is %s before flush', async (action) => {
    client.setQueryData(key, { version: 1 });
    if (action === 'remove') client.removeQueries({ queryKey: key });
    else await client.invalidateQueries({ queryKey: key, refetchType: 'none' });
    await vi.advanceTimersByTimeAsync(300);
    expect(snapshotsSerialized()).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves the persistence allowlist and excludes old bootstrap data', async () => {
    for (const entry of [
      ['resource', 'git', 'C:/repo', 'graph', 'head'],
      ['resource', 'git', 'C:/repo', 'getDiffPreview', ['diff']],
      ['resource', 'git', 'C:/repo', 'getCommitLogPage', { offset: 100, limit: 100 }],
      ['resource', 'git', 'C:/repo', 'getCommitLogPage', { offset: 0, limit: 200 }],
    ])
      client.setQueryData(entry, 'private or non-preview');
    client.setQueryData(key, 'old', { updatedAt: Date.now() - 100 });
    await vi.advanceTimersByTimeAsync(300);
    expect(snapshotsSerialized()).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps later updates while an earlier save is still in flight and tolerates failed saves', async () => {
    let fail!: (error: Error) => void;
    save.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    client.setQueryData(key, { version: 1 });
    await vi.advanceTimersByTimeAsync(300);
    client.setQueryData(key, { version: 2 });
    fail(new Error('Storage unavailable'));
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0]).toEqual([expect.objectContaining({ data: { version: 1 } })]);
    expect(save.mock.calls[1][0]).toEqual([expect.objectContaining({ data: { version: 2 } })]);
  });

  it('unsubscribes and clears pending work on disposal', async () => {
    client.setQueryData(key, { version: 1 });
    persistence.dispose();
    client.setQueryData(key, { version: 2 });
    await vi.advanceTimersByTimeAsync(300);
    expect(snapshotsSerialized()).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('does no persistence work when the API is unavailable', async () => {
    persistence.dispose();
    persistence = createPreviewPersistence(client.getQueryCache(), undefined, Date.now() - 1);
    client.setQueryData(key, { version: 1 });
    await vi.advanceTimersByTimeAsync(300);
    persistence.flush();
    expect(snapshotsSerialized()).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });
});
