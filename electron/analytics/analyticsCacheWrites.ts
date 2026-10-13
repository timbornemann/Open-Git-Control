import * as path from 'node:path';

const pending = new Map<string, Promise<void>>();

/** Quota checks and writes across contexts/repositories must not overlap. */
export function serializeAnalyticsCacheWrite(root: string, work: () => Promise<void>): Promise<void> {
  const resolved = path.resolve(root);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const next = (pending.get(key) ?? Promise.resolve()).then(work);
  const completed = next.catch(() => undefined);
  pending.set(key, completed);
  void completed.then(() => {
    if (pending.get(key) === completed) pending.delete(key);
  });
  return next;
}
