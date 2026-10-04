import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { RemotePreferences } from '../../src/types/remoteTransfers';
import { repositoryPathKey } from '../main-process/activeRepositoryAuthorization';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { normalizeRemotePreferences } from './remoteTransferValidation';

type Store = { version: 2; repositories: Record<string, RemotePreferences> };

export class RemotePreferencesStore {
  constructor(private readonly filePath: () => string = () => path.join(app.getPath('userData'), 'repository-remotes.json')) {}

  private readStore(): Store {
    try {
      const input = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as { version: number; repositories: Record<string, RemotePreferences> };
      if (![1, 2].includes(input.version) || !input.repositories || typeof input.repositories !== 'object' || Array.isArray(input.repositories))
        throw new Error('Unsupported store.');
      const repositories: Record<string, RemotePreferences> = Object.create(null);
      for (const [key, value] of Object.entries(input.repositories)) {
        const preferences = normalizeRemotePreferences(value);
        if (input.version === 1) {
          delete preferences.selectionModes;
          delete preferences.selectionSnapshots;
        }
        repositories[key] = preferences;
      }
      const store: Store = { version: 2, repositories };
      if (input.version === 1) writeTextFileAtomically(this.filePath(), `${JSON.stringify(store, null, 2)}\n`);
      return store;
    } catch (error) {
      if (fs.existsSync(this.filePath())) throw new Error('Remote preferences could not be read. The existing file was preserved.', { cause: error });
      return { version: 2, repositories: Object.create(null) };
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
