import * as path from 'node:path';

const key = (file: string) => {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};
const leases = new Map<string, number>();
const uses = new Map<string, number>();
const listeners = new Set<(file: string, usedAt: number) => void>();
const inside = (parent: string, child: string) => child === parent || child.startsWith(`${parent}${path.sep}`);

/** Only consuming/producing a cache result touches usage; inventory never does. */
export function recordCacheUse(file: string, usedAt = Date.now()): void {
  const normalized = key(file);
  uses.set(normalized, usedAt);
  if (uses.size > 10_000) uses.delete(uses.keys().next().value!);
  for (const listener of listeners) listener(normalized, usedAt);
}
export const cacheLastUsed = (file: string): number | undefined => uses.get(key(file));
export function onCacheUse(listener: (file: string, usedAt: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function leaseStorage(file: string): () => void {
  const normalized = key(file);
  leases.set(normalized, (leases.get(normalized) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (leases.get(normalized) || 1) - 1;
    if (count) leases.set(normalized, count);
    else leases.delete(normalized);
  };
}
export function isStorageBusy(file: string): boolean {
  const normalized = key(file);
  return [...leases.keys()].some((leased) => inside(normalized, leased) || inside(leased, normalized));
}
