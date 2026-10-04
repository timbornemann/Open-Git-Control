import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { HostedRepository, HostingConnection } from '../../src/types/hostingDtos';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { isSecureStorageAvailable } from '../main-process/secureStore';

type Catalog = { version: 1; userId: string | null; username: string | null; savedAt: number; publicItems: HostedRepository[]; encryptedPrivateItems?: string };

export class HostingCatalogStore {
  constructor(private readonly directory: () => string = () => path.join(app.getPath('userData'), 'hosting-catalogs')) {}
  private file(id: string): string {
    return path.join(this.directory(), `${createHash('sha256').update(id).digest('hex')}.json`);
  }

  read(connection: HostingConnection): HostedRepository[] | null {
    try {
      const stored = JSON.parse(fs.readFileSync(this.file(connection.id), 'utf8')) as Catalog;
      if (stored.version !== 1 || stored.userId !== connection.userId || stored.username !== connection.username || !Array.isArray(stored.publicItems))
        return null;
      const privateItems =
        stored.encryptedPrivateItems && isSecureStorageAvailable()
          ? (JSON.parse(safeStorage.decryptString(Buffer.from(stored.encryptedPrivateItems, 'base64'))) as HostedRepository[])
          : [];
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
    writeTextFileAtomically(
      this.file(connection.id),
      JSON.stringify({
        version: 1,
        userId: connection.userId,
        username: connection.username,
        savedAt: Date.now(),
        publicItems,
        encryptedPrivateItems,
      } satisfies Catalog),
    );
  }

  remove(id: string): void {
    fs.rmSync(this.file(id), { force: true });
  }
}
