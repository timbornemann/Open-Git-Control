import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from '../main-process/atomicFile';

export type HostingStoreData<T> = { version: 1; connections: T[]; legacyGithubMigrated: boolean };

/** Versioned metadata only; authentication material belongs in the encrypted store. */
export class HostingStore<T extends { id: string }> {
  constructor(
    private readonly validate: (value: unknown) => value is T,
    private readonly filePath: () => string = () => path.join(app.getPath('userData'), 'hosting-connections.json'),
  ) {}

  read(): HostingStoreData<T> {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as HostingStoreData<T>;
      if (value.version !== 1 || !Array.isArray(value.connections)) throw new Error('Unsupported hosting connection store.');
      const connections = value.connections.filter(this.validate);
      return {
        version: 1,
        connections: [...new Map(connections.map((connection) => [connection.id, connection])).values()],
        legacyGithubMigrated: value.legacyGithubMigrated === true,
      };
    } catch (error) {
      if (fs.existsSync(this.filePath())) throw new Error('Hosting connections could not be read. The existing store was preserved.', { cause: error });
      return { version: 1, connections: [], legacyGithubMigrated: false };
    }
  }

  write(data: HostingStoreData<T>): void {
    if (data.version !== 1 || !data.connections.every(this.validate)) throw new Error('Invalid hosting connection store.');
    writeTextFileAtomically(this.filePath(), JSON.stringify(data, null, 2));
  }
}
