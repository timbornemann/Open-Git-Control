import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ getPath: vi.fn(), spawn: vi.fn(), packaged: true }));
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.packaged;
    },
    getPath: mocks.getPath,
    getVersion: () => '3.0.5',
  },
}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
import { openRecoveryUpdater, prepareRecoveryUpdater, registerRecoveryShortcuts } from '../recoveryUpdater';
import { hasLiveRecoveryLease, hasLiveRecoveryInstallerLease, recoveryKey } from '../recoveryInstallation';

let directory: string;
const originalResources = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const name = process.platform === 'win32' ? 'Open-Git-Control-Recovery.exe' : 'open-git-control-recovery';
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-recovery-test-'));
  fs.mkdirSync(path.join(directory, 'installed/resources/recovery'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'app-data'));
  const executable = path.join(
    directory,
    process.platform === 'darwin' ? 'installed/Open-Git-Control.app/Contents/MacOS/Open-Git-Control' : 'installed/Open-Git-Control.exe',
  );
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'main app');
  mocks.getPath.mockImplementation((key) =>
    key === 'appData' ? path.join(directory, 'app-data') : key === 'exe' ? executable : path.join(directory, 'profile'),
  );
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: path.join(directory, 'installed/resources') });
  mocks.packaged = true;
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn(), kill: vi.fn() });
    queueMicrotask(() => {
      child.emit('spawn');
      child.emit('close', 0);
    });
    return child;
  });
  fs.writeFileSync(path.join(process.resourcesPath, 'recovery', name), 'independent helper');
});
afterEach(() => {
  if (originalResources) Object.defineProperty(process, 'resourcesPath', originalResources);
  else Reflect.deleteProperty(process, 'resourcesPath');
  mocks.spawn.mockReset();
  mocks.getPath.mockReset();
  const target = path.resolve(directory);
  if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('ogc-recovery-test-')) throw new Error('Invalid fixture');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
describe('independent recovery launch', () => {
  it('copies the bundled executable outside the installation, records its profile and launches only that trusted path', async () => {
    const result = await openRecoveryUpdater();
    expect(result).toEqual({ success: true });
    const [executable, args, options] = mocks.spawn.mock.calls[0];
    expect(executable).toBe(
      path.join(directory, 'app-data/Open-Git-Control-Recovery/bin/3.0.5', createHash('sha256').update('independent helper').digest('hex').slice(0, 32), name),
    );
    expect(fs.readFileSync(executable, 'utf8')).toBe('independent helper');
    expect(args[0]).toBe('--installation');
    expect(args.slice(-2)).toEqual(['--profile', path.join(directory, 'profile')]);
    expect(options).toMatchObject({ cwd: path.dirname(executable), windowsHide: true, detached: true, stdio: 'ignore' });
    const record = path.join(directory, 'app-data/Open-Git-Control-Recovery/installations', recoveryKey(args[1]), 'installation.json');
    expect(JSON.parse(fs.readFileSync(record, 'utf8'))).toMatchObject({
      appId: 'com.opengitcontrol.app',
      target: args[1],
      profile: path.join(directory, 'profile'),
      version: '3.0.5',
    });
  });
  it('reuses unchanged retained helpers and replaces changed bytes atomically', async () => {
    const executable = await prepareRecoveryUpdater();
    const before = fs.statSync(executable).mtimeMs;
    expect(await prepareRecoveryUpdater()).toBe(executable);
    expect(fs.statSync(executable).mtimeMs).toBe(before);
    fs.writeFileSync(path.join(process.resourcesPath, 'recovery', name), 'new helper bytes');
    const changed = await prepareRecoveryUpdater();
    expect(changed).not.toBe(executable);
    expect(fs.readFileSync(changed, 'utf8')).toBe('new helper bytes');
    expect(fs.readFileSync(executable, 'utf8')).toBe('independent helper');
    expect(fs.readdirSync(path.dirname(changed))).toEqual([name]);
  });
  it('returns an actionable failure for a missing helper and does not start another executable', async () => {
    fs.unlinkSync(path.join(process.resourcesPath, 'recovery', name));
    expect((await openRecoveryUpdater()).success).toBe(false);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('registers OS shortcuts without a shell or console window', async () => {
    const executable = await prepareRecoveryUpdater();
    await registerRecoveryShortcuts(executable);
    expect(mocks.spawn.mock.calls[0][0]).toBe(executable);
    expect(mocks.spawn.mock.calls[0][1][0]).toBe('--register-only');
    expect(mocks.spawn.mock.calls[0][2]).toMatchObject({ windowsHide: true, stdio: 'ignore' });
    expect(mocks.spawn.mock.calls[0][2].shell).toBeUndefined();
  });
});
describe('shared installation locks', () => {
  it('also blocks another Windows updater while the shared NSIS installer scope is owned', () => {
    const root = path.join(directory, 'shared-lock');
    const lock = path.join(root, 'windows-installer/install.lock');
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({ schema: 1, appId: 'com.opengitcontrol.app', pid: process.pid, target: path.join(directory, 'another-installation') }),
    );
    expect(hasLiveRecoveryInstallerLease(root)).toBe(true);
  });
  it('blocks live, unpublished or damaged ownership records, ignores a confirmed exited owner, and keeps other installations separate', () => {
    const root = path.join(directory, 'locks'),
      target = path.join(directory, 'installed');
    expect(hasLiveRecoveryLease(root, target)).toBe(false);
    const lock = path.join(root, 'installations', recoveryKey(target), 'install.lock');
    fs.mkdirSync(lock, { recursive: true });
    expect(hasLiveRecoveryLease(root, target)).toBe(true);
    fs.writeFileSync(path.join(lock, 'owner.json'), 'damaged');
    expect(hasLiveRecoveryLease(root, target)).toBe(true);
    const owner = { schema: 1, appId: 'com.opengitcontrol.app', pid: process.pid, target };
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify(owner));
    expect(hasLiveRecoveryLease(root, target)).toBe(true);
    expect(hasLiveRecoveryLease(root, path.join(directory, 'other'))).toBe(false);
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ ...owner, pid: 2_147_483_647 }));
    expect(hasLiveRecoveryLease(root, target)).toBe(false);
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ ...owner, pid: 2_147_483_647, installerPid: process.pid }));
    expect(hasLiveRecoveryLease(root, target)).toBe(true);
  });
  it('uses identical keys for canonical Windows paths used by Rust and Electron', () => {
    expect(recoveryKey('C:\\Apps\\Open-Git-Control', true)).toBe(recoveryKey('\\\\?\\c:\\apps\\open-git-control\\', true));
  });
});
