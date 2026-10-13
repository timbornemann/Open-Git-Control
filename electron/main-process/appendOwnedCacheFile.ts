import * as fs from 'node:fs';
import { assertManagedPathAsync } from './storageSafety';
import { cacheFileIdentityAsync, identityFromStat } from './cacheFileIdentity';

/** Append through the validated descriptor, never adopt a foreign replacement's identity. */
export async function appendOwnedCacheFile(root: string, file: string, text: string, expected: string | null): Promise<string> {
  await assertManagedPathAsync(root, file);
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_APPEND |
    (fs.constants.O_NOFOLLOW ?? 0) |
    (fs.constants.O_NONBLOCK ?? 0) |
    (expected === null ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0);
  const handle = await fs.promises.open(file, flags, 0o600);
  try {
    const before = identityFromStat(await handle.stat());
    if ((expected !== null && before !== expected) || (await cacheFileIdentityAsync(file)) !== before)
      throw new Error('The cache changed while preparing its append.');
    await handle.writeFile(text, 'utf8');
    const identity = identityFromStat(await handle.stat());
    if ((await cacheFileIdentityAsync(file)) !== identity) throw new Error('The cache changed during its append.');
    return identity;
  } finally {
    await handle.close();
  }
}
