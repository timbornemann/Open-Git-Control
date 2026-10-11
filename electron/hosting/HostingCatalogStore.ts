import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { HostedRepository, HostingConnection } from '../../src/types/hostingDtos';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { isSecureStorageAvailable } from '../main-process/secureStore';
import { assertManagedPath } from '../main-process/storageSafety';
import { recordCacheUse } from '../main-process/managedStorage';
import { canPersistAuxiliary } from '../main-process/auxiliaryDiskBudget';
import { mayReplaceCache } from '../main-process/cacheReplacement';

type Catalog = { version: 1; userId: string | null; username: string | null; savedAt: number; publicItems: HostedRepository[]; encryptedPrivateItems?: string };

export class HostingCatalogStore {
  constructor(private readonly directory: () => string = () => path.join(app.getPath('userData'), 'hosting-catalogs')) {}
  private file(id: string): string {
    return path.join(this.directory(), `${createHash('sha256').update(id).digest('hex')}.json`);
  }

  read(connection: HostingConnection): HostedRepository[] | null {
    try {
      assertManagedPath(this.directory(), this.file(connection.id));
      const stored = JSON.parse(fs.readFileSync(this.file(connection.id), 'utf8')) as Catalog;
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

  write(connection: HostingConnection, items: HostedRepository[]): void {
    const publicItems = items.filter((repo) => !repo.private);
    const privateItems = items.filter((repo) => repo.private);
    const encryptedPrivateItems =
      privateItems.length && isSecureStorageAvailable() ? safeStorage.encryptString(JSON.stringify(privateItems)).toString('base64') : undefined;
    const file = this.file(connection.id);
    if (
      !mayReplaceCache(this.directory(), file, (value) =>
        Boolean(
          value &&
          typeof value === 'object' &&
          'version' in value &&
          value.version === 1 &&
          Array.isArray((value as Catalog).publicItems) &&
          Number.isFinite((value as Catalog).savedAt),
        ),
      )
    )
      return;
    const raw = JSON.stringify({
      version: 1,
      userId: connection.userId,
      username: connection.username,
      savedAt: Date.now(),
      publicItems,
      encryptedPrivateItems,
    } satisfies Catalog);
    if (!canPersistAuxiliary(path.dirname(this.directory()), file, Buffer.byteLength(raw))) return;
    writeTextFileAtomically(file, raw);
    recordCacheUse(file);
  }

  remove(id: string): void {
    assertManagedPath(this.directory(), this.file(id));
    if (
      !mayReplaceCache(this.directory(), this.file(id), (value) =>
        Boolean(value && typeof value === 'object' && 'version' in value && value.version === 1 && Array.isArray((value as Catalog).publicItems)),
      )
    )
      return;
    fs.rmSync(this.file(id), { force: true });
  }
}
