import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { DISK_CACHE_BYTES, MAX_SNAPSHOT_BYTES, MEMORY_CACHE_BYTES, isPreviewSnapshot, type PreviewSnapshot } from '../../src/shared/cache/resource';
import { isSecureStorageAvailable } from './secureStore';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { cacheLastUsed, leaseStorage, recordCacheUse } from './managedStorage';
import { assertManagedPath } from './storageSafety';
import { mayReplaceCache } from './cacheReplacement';

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

const validRepositorySummary = (data: unknown, key: PreviewSnapshot['key']) =>
  key[1] === 'git' &&
  key.length === 4 &&
  object(data) &&
  Object.keys(data).length === 3 &&
  typeof data.repoPath === 'string' &&
  data.repoPath.length > 0 &&
  data.repoPath.length <= 4096 &&
  repositoryPathKey(data.repoPath) === repositoryPathKey(key[2]) &&
  Number.isSafeInteger(data.changeCount) &&
  Number(data.changeCount) >= 0 &&
  typeof data.checkedAt === 'number' &&
  Number.isFinite(data.checkedAt) &&
  data.checkedAt > 0 &&
  data.checkedAt <= Date.now() + 60_000;

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
    case 'getRepositoryChangeSummary':
      return validRepositorySummary(data, value.key);
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

async function loadPreviewCache(allowedScope: (snapshot: PreviewSnapshot) => boolean): Promise<PreviewSnapshot[]> {
  const directory = cacheDirectory();
  let names: string[];
  try {
    assertManagedPath(app.getPath('userData'), directory);
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
      assertManagedPath(app.getPath('userData'), file);
      const stat = await fs.stat(file);
      if (stat.size > MAX_SNAPSHOT_BYTES * 2) {
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
        continue;
      }
      if (name !== `${createHash('sha256').update(JSON.stringify(entry.key)).digest('hex')}.json`) continue;
      if (allowedScope(entry)) {
        const size = JSON.stringify(entry).length * 2;
        if (bytes + size > MEMORY_CACHE_BYTES) continue;
        bytes += size;
        snapshots.push(entry);
        // Startup hydration is provisional; only a subsequent live read/write counts as use.
      }
    } catch {
      // Preserve unreadable and future formats for diagnosis.
    }
  }
  return snapshots;
}
export function readPreviewCache(allowedScope: (snapshot: PreviewSnapshot) => boolean): Promise<PreviewSnapshot[]> {
  const request = writeQueue
    .catch(() => {})
    .then(async () => {
      const release = leaseStorage(cacheDirectory());
      try {
        return await loadPreviewCache(allowedScope);
      } finally {
        release();
      }
    });
  writeQueue = request.then(
    () => {},
    () => {},
  );
  return request;
}

export function savePreviewCache(input: unknown[], allowedScope: (snapshot: PreviewSnapshot) => boolean): Promise<void> {
  // Capture the authorization decision before queueing IO; a later account
  // switch must not grant an old renderer response access to another scope.
  const entries = input.slice(0, 100).filter((entry): entry is PreviewSnapshot => validatePreview(entry) && allowedScope(entry));
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const directory = cacheDirectory();
      const release = leaseStorage(directory);
      try {
        assertManagedPath(app.getPath('userData'), directory);
        await fs.mkdir(directory, { recursive: true });
        for (const entry of entries) {
          let raw = JSON.stringify(entry);
          if (Buffer.byteLength(raw) > MAX_SNAPSHOT_BYTES) continue;
          if (entry.key[1] === 'github') {
            if (!isSecureStorageAvailable()) continue;
            raw = JSON.stringify({ encrypted: safeStorage.encryptString(raw).toString('base64') });
          }
          const file = path.join(directory, `${createHash('sha256').update(JSON.stringify(entry.key)).digest('hex')}.json`);
          const temporary = `${file}.${randomUUID()}.tmp`;
          assertManagedPath(app.getPath('userData'), file);
          assertManagedPath(app.getPath('userData'), temporary);
          if (!mayReplaceCache(app.getPath('userData'), file, validatePreview)) continue;
          let prior = 0;
          try {
            prior = (await fs.stat(file)).size;
          } catch {
            /* New cache entry. */
          }
          const bytes = Buffer.byteLength(raw);
          const retainedBytes = await trimPreviewCache(directory, DISK_CACHE_BYTES - bytes + prior, file);
          if (retainedBytes - prior + bytes > DISK_CACHE_BYTES) continue;
          try {
            const handle = await fs.open(temporary, 'wx', 0o600);
            try {
              await handle.writeFile(raw);
              await handle.sync();
            } finally {
              await handle.close();
            }
            assertManagedPath(app.getPath('userData'), file);
            assertManagedPath(app.getPath('userData'), temporary);
            await fs.rename(temporary, file);
          } finally {
            assertManagedPath(app.getPath('userData'), temporary);
            await fs.rm(temporary, { force: true });
          }
          recordCacheUse(file);
        }
        await trimPreviewCache(directory);
      } finally {
        release();
      }
    });
  return writeQueue;
}

export async function trimPreviewCache(directory = cacheDirectory(), maxBytes = DISK_CACHE_BYTES, replacing?: string) {
  const entries = await Promise.all(
    (await fs.readdir(directory))
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .map(async (name) => {
        const file = path.join(directory, name);
        assertManagedPath(app.getPath('userData'), file);
        const stat = await fs.stat(file);
        return { file, size: stat.size, used: cacheLastUsed(file) ?? Date.now(), supported: mayReplaceCache(app.getPath('userData'), file, validatePreview) };
      }),
  );
  let size = entries.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of entries.sort((a, b) => a.used - b.used)) {
    if (size <= maxBytes) break;
    if (!entry.supported || entry.file === replacing) continue;
    assertManagedPath(app.getPath('userData'), entry.file);
    await fs.unlink(entry.file);
    size -= entry.size;
  }
  return size;
}
