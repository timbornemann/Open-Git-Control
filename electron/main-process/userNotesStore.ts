import * as path from 'node:path';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { writeTextFileAtomicallyAsync } from './atomicFile';
import { canPersistAuxiliary, serializeAuxiliaryWrite } from './auxiliaryDiskBudget';
import { cacheFileIdentityAsync } from './cacheFileIdentity';
import { readStorageJsonAsync } from './storageSafety';
import { recordCacheUse } from './managedStorage';
import { isUserNotesAcknowledgements, isUserNotesSnapshot, USER_NOTES_SOURCE, type UserNotesSnapshot } from './userNotesModel';

const SNAPSHOT_FILE = 'user-notes-v1.json';
const ACKNOWLEDGEMENTS_FILE = 'user-notes-acknowledgements-v1.json';

export class UserNotesStore {
  constructor(private readonly root: string) {}

  private async read<T>(name: string, validate: (value: unknown) => value is T, limit: number): Promise<T | null> {
    try {
      const value = await readStorageJsonAsync(this.root, path.join(this.root, name), limit);
      if (!validate(value)) throw new Error('The saved user notes format is unsupported.');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async loadSnapshot(): Promise<UserNotesSnapshot | null> {
    const snapshot = await this.read(SNAPSHOT_FILE, isUserNotesSnapshot, STORAGE_BUDGETS.auxiliary);
    if (snapshot) recordCacheUse(path.join(this.root, SNAPSHOT_FILE));
    return snapshot;
  }

  async loadAcknowledgements(): Promise<Record<string, string>> {
    return (await this.read(ACKNOWLEDGEMENTS_FILE, isUserNotesAcknowledgements, 1024 * 1024))?.revisions || {};
  }

  async saveSnapshot(snapshot: UserNotesSnapshot, current: () => boolean): Promise<void> {
    if (!isUserNotesSnapshot(snapshot)) throw new Error('Invalid user notes snapshot.');
    const text = JSON.stringify(snapshot);
    const file = path.join(this.root, SNAPSHOT_FILE);
    await serializeAuxiliaryWrite(this.root, async () => {
      const identity = await cacheFileIdentityAsync(file);
      await this.read(SNAPSHOT_FILE, isUserNotesSnapshot, STORAGE_BUDGETS.auxiliary);
      if (!(await canPersistAuxiliary(this.root, file, Buffer.byteLength(text)))) throw new Error('User notes exceed the available cache budget.');
      await writeTextFileAtomicallyAsync(file, text, this.root, async () => current() && (await cacheFileIdentityAsync(file)) === identity);
      recordCacheUse(file);
    });
  }

  async saveAcknowledgements(revisions: Record<string, string>): Promise<void> {
    const value = { version: 1, source: USER_NOTES_SOURCE, revisions };
    if (!isUserNotesAcknowledgements(value)) throw new Error('Invalid user notes acknowledgements.');
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Too many user notes acknowledgements.');
    const file = path.join(this.root, ACKNOWLEDGEMENTS_FILE);
    const identity = await cacheFileIdentityAsync(file);
    await this.read(ACKNOWLEDGEMENTS_FILE, isUserNotesAcknowledgements, 1024 * 1024);
    await writeTextFileAtomicallyAsync(file, text, this.root, async () => (await cacheFileIdentityAsync(file)) === identity);
  }
}
