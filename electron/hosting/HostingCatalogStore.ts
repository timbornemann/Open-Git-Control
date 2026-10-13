import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { HostedRepository, HostingConnection } from '../../src/types/hostingDtos';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { isSecureStorageAvailable } from '../main-process/secureStore';
import { assertManagedPath } from '../main-process/storageSafety';
import { recordCacheUse } from '../main-process/managedStorage';
import { canPersistAuxiliary, serializeAuxiliaryWrite } from '../main-process/auxiliaryDiskBudget';
import { mayReplaceCacheAsync } from '../main-process/cacheReplacement';
import { cacheFileIdentityAsync } from '../main-process/cacheFileIdentity';
import { readBoundedTextFile } from '../main-process/boundedTextFile';

type Catalog = { version: 1; userId: string | null; username: string | null; savedAt: number; publicItems: HostedRepository[]; encryptedPrivateItems?: string };

export class HostingCatalogStore {
  private readonly operations = new Map<string, symbol>();
  private readonly previews = new Map<string, { operation: symbol; connection: HostingConnection; items: HostedRepository[] }>();
  private readonly pending = new Set<Promise<void>>();
  constructor(private readonly directory: () => string = () => path.join(app.getPath('userData'), 'hosting-catalogs')) {}
  private file(id: string): string {
    return path.join(this.directory(), `${createHash('sha256').update(id).digest('hex')}.json`);
  }

  read(connection: HostingConnection): HostedRepository[] | null {
    const preview = this.previews.get(connection.id);
    if (preview && preview.connection.userId === connection.userId && preview.connection.username === connection.username)
      return preview.items.filter((repo) => repo?.ref?.connectionId === connection.id);
    try {
      assertManagedPath(this.directory(), this.file(connection.id));
      const stored = JSON.parse(readBoundedTextFile(this.file(connection.id), 16 * 1024 ** 2, 'Hosting catalogue')) as Catalog;
      if (stored.version !== 1 || stored.userId !== connection.userId || stored.username !== connection.username || !Array.isArray(stored.publicItems))
        return null;
      const privateItems =
        stored.encryptedPrivateItems && isSecureStorageAvailable()
          ? (JSON.parse(safeStorage.decryptString(Buffer.from(stored.encryptedPrivateItems, 'base64'))) as HostedRepository[])
          : [];
      recordCacheUse(this.file(connection.id));
      return [...stored.publicItems, ...privateItems].filter((repo) => repo?.ref?.connectionId === connection.id);
    } catch {
      return null;
    }
  }

  async settleWrites(): Promise<void> {
    await Promise.all([...this.pending].map((write) => write.catch(() => undefined)));
  }
  private track(write: Promise<void>): Promise<void> {
    this.pending.add(write);
    void write.then(
      () => this.pending.delete(write),
      () => this.pending.delete(write),
    );
    return write;
  }
  write(connection: HostingConnection, items: HostedRepository[]): Promise<void> {
    const publicItems = items.filter((repo) => !repo.private);
    const privateItems = items.filter((repo) => repo.private);
    const encryptedPrivateItems =
      privateItems.length && isSecureStorageAvailable() ? safeStorage.encryptString(JSON.stringify(privateItems)).toString('base64') : undefined;
    const file = this.file(connection.id);
    const raw = JSON.stringify({
      version: 1,
      userId: connection.userId,
      username: connection.username,
      savedAt: Date.now(),
      publicItems,
      encryptedPrivateItems,
    } satisfies Catalog);
    const operation = Symbol();
    this.operations.set(connection.id, operation);
    // Identity migration can happen before a slow disk write completes.
    this.previews.set(connection.id, { operation, connection: { ...connection }, items: [...items] });
    const current = () => this.operations.get(connection.id) === operation;
    return this.track(
      serializeAuxiliaryWrite(path.dirname(this.directory()), async () => {
        if (!current()) return;
        const identity = await cacheFileIdentityAsync(file);
        if (
          !(await mayReplaceCacheAsync(this.directory(), file, (value) =>
            Boolean(
              value &&
              typeof value === 'object' &&
              'version' in value &&
              value.version === 1 &&
              Array.isArray((value as Catalog).publicItems) &&
              Number.isFinite((value as Catalog).savedAt),
            ),
          ))
        )
          return;
        if (!(await canPersistAuxiliary(path.dirname(this.directory()), file, Buffer.byteLength(raw))) || !current()) return;
        await writeTextFileAtomicallyAsync(file, raw, this.directory(), async () => current() && (await cacheFileIdentityAsync(file)) === identity);
        recordCacheUse(file);
      }).finally(() => {
        if (current()) this.operations.delete(connection.id);
        if (this.previews.get(connection.id)?.operation === operation) this.previews.delete(connection.id);
      }),
    );
  }

  remove(id: string): Promise<void> {
    this.operations.delete(id);
    this.previews.delete(id);
    const file = this.file(id);
    return this.track(
      serializeAuxiliaryWrite(path.dirname(this.directory()), async () => {
        const identity = await cacheFileIdentityAsync(file);
        if (
          !(await mayReplaceCacheAsync(this.directory(), file, (value) =>
            Boolean(value && typeof value === 'object' && 'version' in value && value.version === 1 && Array.isArray((value as Catalog).publicItems)),
          ))
        )
          return;
        if ((await cacheFileIdentityAsync(file)) === identity) await fs.promises.rm(file, { force: true });
      }),
    );
  }
}
