import { app } from 'electron';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { currentRecoveryInstallation, recoveryKey, recoveryRoot } from './recoveryInstallation';
import { writeTextFileAtomicallyAsync } from './atomicFile';
import { assertManagedPathAsync } from './storageSafety';

const helperName = () => (process.platform === 'win32' ? 'Open-Git-Control-Recovery.exe' : 'open-git-control-recovery');
async function hashFile(file: string): Promise<string> {
  const value = createHash('sha256');
  for await (const chunk of createReadStream(file)) value.update(chunk);
  return value.digest('hex');
}
export function bundledRecoveryHelper(): string {
  return path.join(process.resourcesPath, 'recovery', helperName());
}
let preparing: Promise<string> | undefined;
/** Copy before launching: an installer can replace every file in the main app. */
export function prepareRecoveryUpdater(): Promise<string> {
  if (preparing) return preparing;
  preparing = prepare().finally(() => {
    preparing = undefined;
  });
  return preparing;
}
async function prepare(): Promise<string> {
  if (!app.isPackaged) throw new Error('The independent recovery updater is included in installed release builds.');
  const root = recoveryRoot();
  const installation = currentRecoveryInstallation();
  const source = bundledRecoveryHelper();
  const metadata = await fs.lstat(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT')
      throw new Error('The recovery helper is missing. Download the standalone recovery helper from the official GitHub Releases page.');
    throw error;
  });
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error('The recovery helper is missing. Download the standalone recovery helper from the official GitHub Releases page.');
  const fingerprint = await hashFile(source);
  const directory = path.join(root, 'bin', app.getVersion(), fingerprint.slice(0, 32));
  const destination = path.join(directory, helperName());
  await assertManagedPathAsync(root, destination);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const same = async () => {
    try {
      const existing = await fs.lstat(destination);
      if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== metadata.size) return false;
      return fingerprint === (await hashFile(destination));
    } catch {
      return false;
    }
  };
  const temporary = path.join(directory, `${helperName()}.${randomUUID()}.tmp`);
  try {
    if (!(await same())) {
      await assertManagedPathAsync(root, temporary);
      await fs.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
      await fs.chmod(temporary, 0o700);
      if ((await hashFile(temporary)) !== fingerprint)
        throw new Error('The recovery helper changed while being copied. Retry after the app installation has finished.');
      const handle = await fs.open(temporary, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await assertManagedPathAsync(root, destination);
      await fs.rename(temporary, destination);
    }
  } finally {
    await assertManagedPathAsync(root, temporary);
    await fs.rm(temporary, { force: true });
  }
  const record = path.join(root, 'installations', recoveryKey(installation.target), 'installation.json');
  await writeTextFileAtomicallyAsync(record, JSON.stringify(installation), root);
  return destination;
}
export async function registerRecoveryShortcuts(executable: string): Promise<void> {
  const installation = currentRecoveryInstallation();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['--register-only', '--installation', installation.target, '--profile', installation.profile], {
      cwd: path.dirname(executable),
      windowsHide: true,
      stdio: 'ignore',
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Recovery shortcut registration timed out.'));
    }, 15_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error('Recovery shortcut registration failed.'));
    });
  });
}
export async function openRecoveryUpdater(): Promise<{ success: boolean; error?: string }> {
  try {
    const executable = await prepareRecoveryUpdater();
    const installation = currentRecoveryInstallation();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ['--installation', installation.target, '--profile', installation.profile], {
        cwd: path.dirname(executable),
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
