import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { assertManagedPath } from './storageSafety';

export type RecoveryInstallation = {
  schema: 1;
  appId: 'com.opengitcontrol.app';
  target: string;
  profile: string;
  kind: 'windows' | 'macos' | 'appimage' | 'deb';
  version: string;
  imageIdentity?: { size: number; modifiedAtMs: number };
};
export function recoveryKey(target: string, windows = process.platform === 'win32'): string {
  const normalized = windows
    ? target
        .replace(/^\\\\\?\\/, '')
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase()
    : target.replace(/\/+$/, '');
  return createHash('sha256').update(normalized).digest('hex');
}
export const recoveryRoot = () => path.join(app.getPath('appData'), 'Open-Git-Control-Recovery');
let detected: { signature: string; installation: RecoveryInstallation } | undefined;
export function currentRecoveryInstallation(): RecoveryInstallation {
  const executable = app.getPath('exe');
  const profile = app.getPath('userData');
  const signature = JSON.stringify([process.platform, executable, profile, app.getVersion(), process.env.APPIMAGE]);
  if (detected?.signature === signature) return { ...detected.installation };
  const kind = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.env.APPIMAGE ? 'appimage' : 'deb';
  const target = kind === 'macos' ? path.resolve(path.dirname(executable), '../..') : kind === 'appimage' ? process.env.APPIMAGE! : path.dirname(executable);
  const image = kind === 'appimage' ? fs.statSync(target) : undefined;
  const installation: RecoveryInstallation = {
    schema: 1,
    appId: 'com.opengitcontrol.app',
    target: fs.realpathSync.native(target),
    profile,
    kind,
    version: app.getVersion(),
    ...(image ? { imageIdentity: { size: image.size, modifiedAtMs: Math.floor(image.mtimeMs) } } : {}),
  };
  detected = { signature, installation };
  return { ...installation };
}
/** Small local ownership record; malformed/live unknown locks fail closed. */
export function isRecoveryActive(): boolean {
  try {
    if (!app.isPackaged) return false;
    const installation = currentRecoveryInstallation();
    return hasLiveRecoveryLease(recoveryRoot(), installation.target) || (process.platform === 'win32' && hasLiveRecoveryInstallerLease(recoveryRoot()));
  } catch {
    return true;
  }
}
export function hasLiveRecoveryLease(root: string, target: string): boolean {
  const directory = path.join(root, 'installations', recoveryKey(target), 'install.lock');
  return hasLiveLease(root, directory, target);
}
export function hasLiveRecoveryInstallerLease(root: string): boolean {
  return hasLiveLease(root, path.join(root, 'windows-installer', 'install.lock'));
}
function hasLiveLease(root: string, directory: string, target?: string): boolean {
  try {
    assertManagedPath(root, path.join(directory, 'owner.json'));
    const dir = fs.lstatSync(directory);
    if (!dir.isDirectory() || dir.isSymbolicLink()) return true;
    const file = path.join(directory, 'owner.json');
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) return true;
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      owner.schema !== 1 ||
      owner.appId !== 'com.opengitcontrol.app' ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.target !== 'string' ||
      !path.isAbsolute(owner.target) ||
      (target !== undefined && recoveryKey(owner.target) !== recoveryKey(target))
    )
      return true;
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
      }
    };
    if (owner.installerPid !== undefined && owner.installerPid !== null && (!Number.isSafeInteger(owner.installerPid) || owner.installerPid <= 0)) return true;
    return alive(owner.pid) || (typeof owner.installerPid === 'number' && alive(owner.installerPid));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return true;
    // A directory whose owner is not yet published is an update starting.
    return fs.existsSync(directory);
  }
}
