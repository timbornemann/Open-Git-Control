import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { DISK_CACHE_BYTES, MAX_SNAPSHOT_BYTES, MEMORY_CACHE_BYTES, isPreviewSnapshot, type PreviewSnapshot } from '../../src/shared/cache/resource';
import { isSecureStorageAvailable } from './secureStore';

const cacheDirectory = () => path.join(app.getPath('userData'), 'preview-cache-v1');
let writeQueue = Promise.resolve();
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validPlanner = (data: unknown) =>
  object(data) &&
  data.version === 1 &&
  Array.isArray(data.projects) &&
  Array.isArray(data.items) &&
  data.projects.every(
    (p) =>
      object(p) &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.description === 'string' &&
      ['repository', 'planned'].includes(String(p.kind)),
  ) &&
  data.items.every(
    (i) =>
      object(i) &&
      typeof i.id === 'string' &&
      typeof i.projectId === 'string' &&
      typeof i.title === 'string' &&
      Array.isArray(i.tags) &&
      typeof i.status === 'string' &&
      typeof i.priority === 'string',
  );
const validRuns = (data: unknown) =>
  object(data) &&
  typeof data.hasMore === 'boolean' &&
  Array.isArray(data.runs) &&
  data.runs.every((run) => object(run) && typeof run.id === 'number' && typeof run.name === 'string' && typeof run.status === 'string');
const validRelease = (data: unknown) =>
  object(data) &&
  Array.isArray(data.existingTags) &&
  data.existingTags.every((tag) => typeof tag === 'string') &&
  Array.isArray(data.commitsSinceLastRelease) &&
  typeof data.commitsTarget === 'string';
const validRunConfig = (data: unknown) =>
  object(data) &&
  typeof data.exists === 'boolean' &&
  typeof data.configPath === 'string' &&
  object(data.availableActions) &&
  Array.isArray(data.templates) &&
  (data.config === null || (object(data.config) && data.config.version === 1 && object(data.config.actions)));

/** Validate the allowed DTO shape as well as the envelope, so damaged files
 * cannot install malformed arrays/objects in a view. */
export function validatePreview(value: unknown): value is PreviewSnapshot {
  if (!isPreviewSnapshot(value)) return false;
  const operation = value.key[3];
  const response = value.data;
  if (!object(response) || response.success !== true || !('data' in response)) return false;
  const data = response.data;
  switch (operation) {
    case 'getData':
      return validPlanner(data);
    case 'getCommitLogPage':
      return object(data) && typeof data.raw === 'string' && typeof data.hasMore === 'boolean';
    case 'getWorkingTreeSnapshot':
      return object(data) && typeof data.repoPath === 'string' && typeof data.snapshotId === 'string' && typeof data.statusRaw === 'string';
    case 'getRepoOriginUrl':
      return typeof data === 'string' || data === null;
    case 'command':
      return typeof data === 'string';
    case 'listWorkingDirectory':
      return Array.isArray(data) && data.every((e) => object(e) && typeof e.path === 'string' && typeof e.name === 'string');
    case 'getPullRequests':
      return (
        Array.isArray(data) &&
        data.every(
          (pr) => object(pr) && typeof pr.number === 'number' && typeof pr.title === 'string' && typeof pr.head === 'string' && typeof pr.base === 'string',
        )
      );
    case 'getBranches':
      return Array.isArray(data) && data.every((branch) => typeof branch === 'string');
    case 'getWorkflowRunsPage':
      return validRuns(data);
    case 'getRepository':
      return (
        object(data) &&
        typeof data.owner === 'string' &&
        typeof data.repo === 'string' &&
        typeof data.defaultBranch === 'string' &&
        typeof data.fork === 'boolean'
      );
    case 'getReleaseContext':
      return validRelease(data);
    case 'getConfig':
      return validRunConfig(data);
    default:
      return false;
  }
}

export async function readPreviewCache(allowedScope: (snapshot: PreviewSnapshot) => boolean): Promise<PreviewSnapshot[]> {
  const directory = cacheDirectory();
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const snapshots: PreviewSnapshot[] = [];
  let bytes = 0;
  // Bounded sequential reads avoid a burst of disk IO during window startup.
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    try {
      const stat = await fs.stat(file);
      if (stat.size > MAX_SNAPSHOT_BYTES * 2) {
        await fs.unlink(file);
        continue;
      }
      const stored: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
      const entry =
        object(stored) && typeof stored.encrypted === 'string'
          ? isSecureStorageAvailable()
            ? JSON.parse(safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')))
            : null
          : stored;
      if (!validatePreview(entry) || (entry.key[1] === 'github' && !(object(stored) && typeof stored.encrypted === 'string'))) {
        await fs.unlink(file);
        continue;
      }
      if (allowedScope(entry)) {
        const size = JSON.stringify(entry).length * 2;
        if (bytes + size > MEMORY_CACHE_BYTES) continue;
        bytes += size;
        snapshots.push(entry);
        await fs.utimes(file, new Date(), new Date());
      }
    } catch {
      await fs.unlink(file).catch(() => {});
    }
  }
  return snapshots;
}

export function savePreviewCache(input: unknown[], allowedScope: (snapshot: PreviewSnapshot) => boolean): Promise<void> {
  // Capture the authorization decision before queueing IO; a later account
  // switch must not grant an old renderer response access to another scope.
  const entries = input.slice(0, 100).filter((entry): entry is PreviewSnapshot => validatePreview(entry) && allowedScope(entry));
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const directory = cacheDirectory();
      await fs.mkdir(directory, { recursive: true });
      for (const entry of entries) {
        let raw = JSON.stringify(entry);
        if (Buffer.byteLength(raw) > MAX_SNAPSHOT_BYTES) continue;
        if (entry.key[1] === 'github') {
          if (!isSecureStorageAvailable()) continue;
          raw = JSON.stringify({ encrypted: safeStorage.encryptString(raw).toString('base64') });
        }
        const file = path.join(directory, `${createHash('sha256').update(JSON.stringify(entry.key)).digest('hex')}.json`);
        const temporary = `${file}.tmp`;
        await fs.writeFile(temporary, raw, { mode: 0o600 });
        await fs.rename(temporary, file);
      }
      await trimPreviewCache(directory);
    });
  return writeQueue;
}

export async function trimPreviewCache(directory = cacheDirectory(), maxBytes = DISK_CACHE_BYTES) {
  const entries = await Promise.all(
    (await fs.readdir(directory))
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .map(async (name) => {
        const file = path.join(directory, name);
        const stat = await fs.stat(file);
        return { file, size: stat.size, used: stat.mtimeMs };
      }),
  );
  let size = entries.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of entries.sort((a, b) => a.used - b.used)) {
    if (size <= maxBytes) break;
    await fs.unlink(entry.file);
    size -= entry.size;
  }
}
