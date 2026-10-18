import * as path from 'node:path';
import { assertManagedPathAsync, readStorageJsonAsync } from '../main-process/storageSafety';
import { cacheFileIdentityAsync } from '../main-process/cacheFileIdentity';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { leaseStorage, recordCacheUse } from '../main-process/managedStorage';
import { isLfsInventoryDocument, LFS_INVENTORY_DIRECTORY, MAX_LFS_CACHE_BYTES, type LfsInventoryDocument } from './GitLfsInventoryFormat';

/** Optional durable cache. Filesystem failures never authorize a partial inventory or prevent a fresh scan. */
export class GitLfsInventoryStore {
  private identity: string | null = null;
  private writable = true;
  private file: string | undefined;
  private root: string | undefined;
  constructor(
    private readonly getRoot: () => string,
    private readonly namespace: string,
  ) {}
  async load(): Promise<LfsInventoryDocument | undefined> {
    let release: (() => void) | undefined;
    try {
      this.root = this.getRoot();
      this.file = path.join(this.root, LFS_INVENTORY_DIRECTORY, `${this.namespace}.json`);
      release = leaseStorage(this.file);
      await assertManagedPathAsync(this.root, this.file);
      this.identity = await cacheFileIdentityAsync(this.file);
      if (this.identity === null) return;
      const value = await readStorageJsonAsync(this.root, this.file, MAX_LFS_CACHE_BYTES);
      if ((await cacheFileIdentityAsync(this.file)) !== this.identity) this.writable = false;
      if (value && typeof value === 'object' && 'version' in value && value.version !== 1) this.writable = false;
      if (this.writable && isLfsInventoryDocument(value)) {
        if (value.namespace === this.namespace) return value;
        this.writable = false;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') this.writable = false;
    } finally {
      release?.();
    }
  }
  used(): void {
    if (this.file) recordCacheUse(this.file);
  }
  async save(document: LfsInventoryDocument, signal?: AbortSignal): Promise<void> {
    if (!this.writable || !this.file || !this.root || signal?.aborted) return;
    const raw = JSON.stringify(document);
    if (Buffer.byteLength(raw) > MAX_LFS_CACHE_BYTES) return;
    const release = leaseStorage(this.file);
    try {
      await assertManagedPathAsync(this.root, this.file);
      if ((await cacheFileIdentityAsync(this.file)) !== this.identity) {
        this.writable = false;
        return;
      }
      await writeTextFileAtomicallyAsync(
        this.file,
        raw,
        this.root,
        async () => !signal?.aborted && (await cacheFileIdentityAsync(this.file!)) === this.identity,
        (identity) => {
          this.identity = identity;
        },
      );
    } catch {
      if (!signal?.aborted) this.writable = false;
    } finally {
      release();
    }
  }
}
