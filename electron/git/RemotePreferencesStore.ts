import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { RemotePreferences } from '../../src/types/remoteTransfers';
import { repositoryPathKey } from '../main-process/activeRepositoryAuthorization';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { normalizeRemotePreferences } from './remoteTransferValidation';

type Store = { version: 1; repositories: Record<string, RemotePreferences> };

export class RemotePreferencesStore {
  constructor(private readonly filePath: () => string = () => path.join(app.getPath('userData'), 'repository-remotes.json')) {}

  private readStore(): Store {
    try {
      const input = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as Store;
      if (input.version !== 1 || !input.repositories || typeof input.repositories !== 'object' || Array.isArray(input.repositories))
        throw new Error('Unsupported store.');
      const repositories: Record<string, RemotePreferences> = Object.create(null);
      for (const [key, value] of Object.entries(input.repositories)) repositories[key] = normalizeRemotePreferences(value);
      return { version: 1, repositories };
    } catch (error) {
      if (fs.existsSync(this.filePath())) throw new Error('Remote preferences could not be read. The existing file was preserved.', { cause: error });
      return { version: 1, repositories: Object.create(null) };
    }
  }

  read(repoPath: string): RemotePreferences {
    return this.readStore().repositories[repositoryPathKey(repoPath)] ?? {};
  }

  write(repoPath: string, preferences: RemotePreferences): RemotePreferences {
    const normalized = normalizeRemotePreferences(preferences);
    const store = this.readStore();
    store.repositories[repositoryPathKey(repoPath)] = normalized;
    writeTextFileAtomically(this.filePath(), `${JSON.stringify(store, null, 2)}\n`);
    return normalized;
  }
}
