import { app } from 'electron';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertManagedPath, readStorageJson } from './storageSafety';
import { writeTextFileAtomically } from './atomicFile';
import { leaseStorage } from './managedStorage';
import { HTTP_CACHE_WORKER_FLAG } from './httpCacheWorker';

/** Development's disabled HTTP backend cannot clear an older installed disk cache.
 * Temporarily hand the whole backend to a separate context. Only Electron removes cache entries;
 * no cookie database, setting, individual cache file or index is copied or deleted here.
 */
export async function clearInactiveHttpCache(): Promise<void> {
  const root = app.getPath('userData'),
    source = path.join(root, 'Cache');
  const profile = path.join(root, 'browser-cache-maintenance'),
    staged = path.join(profile, 'Cache');
  const marker = path.join(profile, 'owner.json');
  assertManagedPath(root, source);
  assertManagedPath(root, staged);
  assertManagedPath(root, marker);
  fs.mkdirSync(profile, { recursive: true });
  if (fs.existsSync(marker)) {
    const owner = readStorageJson(root, marker) as { version: number; application: string; purpose: string };
    if (owner.version !== 1 || owner.application !== 'Open-Git-Control' || owner.purpose !== 'http-cache-maintenance')
      throw new Error('Unclear cache maintenance ownership.');
  } else {
    if (fs.readdirSync(profile).length) throw new Error('Unrecognized cache maintenance profile; existing data was preserved.');
    writeTextFileAtomically(marker, JSON.stringify({ version: 1, application: 'Open-Git-Control', purpose: 'http-cache-maintenance' }), root);
  }
  const release = leaseStorage(source);
  try {
    // Recover an interrupted directory handoff before accepting a new one.
    if (fs.existsSync(staged)) {
      if (fs.existsSync(source)) throw new Error('Interrupted HTTP cache handoff has two backends; existing data was preserved.');
      fs.renameSync(staged, source);
    }
    if (!fs.existsSync(source)) return;
    assertManagedPath(root, staged);
    assertManagedPath(root, source);
    fs.renameSync(source, staged);
    let failure: unknown;
    try {
      const nonce = randomUUID();
      writeTextFileAtomically(
        marker,
        JSON.stringify({ version: 1, application: 'Open-Git-Control', purpose: 'http-cache-maintenance', nonce, pid: process.pid }),
        root,
      );
      const environment = { ...process.env };
      delete environment.ELECTRON_RUN_AS_NODE;
      const args = [...(app.isPackaged ? [] : [path.join(__dirname, 'httpCacheWorker.js')]), HTTP_CACHE_WORKER_FLAG, profile, nonce];
      await new Promise<void>((resolve, reject) => {
        execFile(process.execPath, args, { env: environment, windowsHide: true, timeout: 15_000, maxBuffer: 8192 }, (error) =>
          error ? reject(error) : resolve(),
        );
      });
    } catch (error) {
      failure = error;
    }
    try {
      assertManagedPath(root, staged);
      assertManagedPath(root, source);
      if (fs.existsSync(source)) throw new Error('HTTP cache location changed during maintenance; staged data was preserved.');
      fs.renameSync(staged, source);
    } catch (error) {
      failure = new Error('HTTP cache handoff needs recovery; staged data was preserved.', { cause: error });
    }
    if (failure) throw failure;
  } finally {
    release();
  }
}
