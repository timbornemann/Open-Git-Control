import { createHash } from 'node:crypto';
import type { GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import { gitObjectId, type LfsBlob } from './GitLfsPointers';

export const LFS_INVENTORY_DIRECTORY = 'lfs-inventory-v1';
export const MAX_LFS_CACHE_BYTES = 8 * 1024 * 1024;
export const MAX_LFS_CACHE_OBJECTS = 75_000;
export const MAX_LFS_SNAPSHOTS = 16;
export type LfsInventorySnapshot = { root: string; kind: 'commit' | 'tree' | 'blob'; pointers: LfsBlob[] };
export type LfsInventoryPayload = {
  version: 1;
  namespace: string;
  context: string;
  objects: Array<[string, GitLfsPointer | null]>;
  snapshots: LfsInventorySnapshot[];
};
export type LfsInventoryDocument = LfsInventoryPayload & { checksum: string };
export const lfsInventoryHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const pointer = (value: unknown): value is GitLfsPointer =>
  record(value) &&
  exactKeys(value, ['oid', 'size']) &&
  typeof value.oid === 'string' &&
  /^[a-f0-9]{64}$/.test(value.oid) &&
  Number.isSafeInteger(value.size) &&
  (value.size as number) >= 0;

/** Only complete, bounded snapshots with a matching integrity digest are reusable. */
export function isLfsInventoryDocument(value: unknown): value is LfsInventoryDocument {
  if (!record(value) || !exactKeys(value, ['version', 'namespace', 'context', 'objects', 'snapshots', 'checksum']) || value.version !== 1) return false;
  if (![value.namespace, value.context, value.checksum].every((item) => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item))) return false;
  if (
    !Array.isArray(value.objects) ||
    value.objects.length > MAX_LFS_CACHE_OBJECTS ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length > MAX_LFS_SNAPSHOTS
  )
    return false;
  const objects = new Set<string>();
  for (const item of value.objects) {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== 'string' ||
      !gitObjectId.test(item[0]) ||
      objects.has(item[0]) ||
      (item[1] !== null && !pointer(item[1]))
    )
      return false;
    objects.add(item[0]);
  }
  const roots = new Set<string>();
  for (const snapshot of value.snapshots) {
    if (
      !record(snapshot) ||
      !exactKeys(snapshot, ['root', 'kind', 'pointers']) ||
      typeof snapshot.root !== 'string' ||
      !gitObjectId.test(snapshot.root) ||
      roots.has(snapshot.root) ||
      !['commit', 'tree', 'blob'].includes(String(snapshot.kind)) ||
      !Array.isArray(snapshot.pointers) ||
      snapshot.pointers.length > MAX_LFS_CACHE_OBJECTS
    )
      return false;
    roots.add(snapshot.root);
    const blobs = new Set<string>();
    for (const entry of snapshot.pointers) {
      if (
        !record(entry) ||
        !exactKeys(entry, ['blob', 'pointer']) ||
        typeof entry.blob !== 'string' ||
        !gitObjectId.test(entry.blob) ||
        blobs.has(entry.blob) ||
        !pointer(entry.pointer)
      )
        return false;
      blobs.add(entry.blob);
    }
  }
  const { checksum, ...payload } = value;
  return checksum === lfsInventoryHash(payload);
}

export function lfsInventoryDocument(payload: LfsInventoryPayload): LfsInventoryDocument {
  return { ...payload, checksum: lfsInventoryHash(payload) };
}
