import type { Query, QueryCache } from '@tanstack/react-query';
import { isPersistentResource, MAX_SNAPSHOT_BYTES, type PreviewSnapshot } from '@/shared/cache/resource';

export function createPreviewPersistence(cache: QueryCache, save: ((snapshots: PreviewSnapshot[]) => Promise<void>) | undefined, startedAt: number) {
  const pending = new Map<string, Query>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const queries = [...pending.values()];
    pending.clear();
    const batch: PreviewSnapshot[] = [];
    for (const query of queries) {
      const { data, dataUpdatedAt, isInvalidated } = query.state;
      if (isInvalidated || data === undefined || dataUpdatedAt <= startedAt || !isPersistentResource(query.queryKey)) continue;
      const payload = data as { data?: { snapshotId?: string; head?: string } };
      const snapshot: PreviewSnapshot = {
        version: 1,
        key: query.queryKey,
        savedAt: dataUpdatedAt,
        sourceRevision: payload?.data?.snapshotId || payload?.data?.head || String(dataUpdatedAt),
        complete: true,
        data,
      };
      try {
        // Serialize only the latest version of each key, immediately before
        // saving it. The limit covers the complete UTF-8 snapshot, not just data.
        if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <= MAX_SNAPSHOT_BYTES) batch.push(snapshot);
      } catch {
        // One malformed or oversized preview must not prevent other saves.
      }
    }
    if (batch.length) void save?.(batch).catch(() => {});
  };
  const unsubscribe = save
    ? cache.subscribe((event) => {
        if (event.type === 'removed') {
          pending.delete(event.query.queryHash);
          return;
        }
        if (event.type !== 'updated' || event.action.type !== 'success' || !isPersistentResource(event.query.queryKey)) return;
        if (event.query.state.dataUpdatedAt <= startedAt || event.query.state.data === undefined) return;
        pending.set(event.query.queryHash, event.query);
        if (timer === undefined) timer = setTimeout(flush, 300);
      })
    : () => {};
  return {
    flush,
    dispose: () => {
      unsubscribe();
      clearTimeout(timer);
      pending.clear();
    },
  };
}
