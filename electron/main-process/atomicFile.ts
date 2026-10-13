import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertManagedPath, assertManagedPathAsync } from './storageSafety';
import { cacheFileIdentityAsync, identityFromStat } from './cacheFileIdentity';

/** Writes a complete replacement beside the destination and publishes it with rename. */
export function writeTextFileAtomically(filePath: string, contents: string, root = path.dirname(filePath)): void {
  assertManagedPath(root, filePath);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;

  try {
    assertManagedPath(root, temporaryPath);
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    assertManagedPath(root, filePath);
    assertManagedPath(root, temporaryPath);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original error.
      }
    }
    try {
      assertManagedPath(root, temporaryPath);
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // A successfully renamed temporary file no longer exists.
    }
  }
}

/** Same durability and replacement boundary, with non-blocking filesystem I/O. */
export async function writeTextFileAtomicallyAsync(
  filePath: string,
  contents: string,
  root = path.dirname(filePath),
  mayPublish: () => Promise<boolean> = async () => true,
  published?: (identity: string) => void,
): Promise<void> {
  await assertManagedPathAsync(root, filePath);
  const directory = path.dirname(filePath);
  await fs.promises.mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.promises.open>> | null = null;
  try {
    await assertManagedPathAsync(root, temporaryPath);
    handle = await fs.promises.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    const prepared = await handle.stat();
    await assertManagedPathAsync(root, filePath);
    await assertManagedPathAsync(root, temporaryPath);
    if (!(await mayPublish())) throw new Error('The destination changed while preparing its replacement.');
    await fs.promises.rename(temporaryPath, filePath);
    const actual = await handle.stat();
    const identity = identityFromStat(actual);
    if (actual.size !== prepared.size || actual.mtimeMs !== prepared.mtimeMs || (await cacheFileIdentityAsync(filePath)) !== identity)
      throw new Error('The destination changed after publishing its replacement.');
    published?.(identity);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await assertManagedPathAsync(root, temporaryPath)
      .then(() => fs.promises.rm(temporaryPath, { force: true }))
      .catch(() => undefined);
  }
}
