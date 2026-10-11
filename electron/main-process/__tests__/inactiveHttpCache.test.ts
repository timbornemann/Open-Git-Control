import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const worker = vi.hoisted(() => ({ root: '', execute: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => worker.root, isPackaged: false }, session: {} }));
vi.mock('node:child_process', () => ({ execFile: worker.execute }));
import { clearInactiveHttpCache } from '../inactiveHttpCache';
import { isStorageBusy } from '../managedStorage';

describe('interrupted legacy HTTP cache handoff', () => {
  let root: string, source: string, profile: string, staged: string;
  const owner = { version: 1, application: 'Open-Git-Control', purpose: 'http-cache-maintenance' };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-http-handoff-test-'));
    worker.root = root;
    source = path.join(root, 'Cache');
    profile = path.join(root, 'browser-cache-maintenance');
    staged = path.join(profile, 'Cache');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'sentinel'), 'old cache');
    worker.execute.mockImplementation((_executable, _args, _options, callback) => {
      callback(null, '', '');
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-http-handoff-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const marker = () => {
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'owner.json'), JSON.stringify(owner));
  };
  it('restores a failed worker handoff and releases the cache lease for retry', async () => {
    worker.execute.mockImplementationOnce((_executable, args, options, callback) => {
      expect(isStorageBusy(source)).toBe(true);
      expect(fs.existsSync(source)).toBe(false);
      expect(args).toContain(profile);
      expect(options.windowsHide).toBe(true);
      expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      callback(new Error('worker failed'));
    });
    await expect(clearInactiveHttpCache()).rejects.toThrow('worker failed');
    expect(fs.readFileSync(path.join(source, 'sentinel'), 'utf8')).toBe('old cache');
    expect(fs.existsSync(staged)).toBe(false);
    expect(isStorageBusy(source)).toBe(false);
    await clearInactiveHttpCache();
    expect(fs.existsSync(source)).toBe(true);
  });
  it('recovers an interrupted directory handoff before starting a new operation', async () => {
    marker();
    fs.renameSync(source, staged);
    await clearInactiveHttpCache();
    expect(fs.readFileSync(path.join(source, 'sentinel'), 'utf8')).toBe('old cache');
    expect(fs.existsSync(staged)).toBe(false);
    expect(worker.execute).toHaveBeenCalledOnce();
  });
  it('preserves both backends when a concurrent process has created another cache', async () => {
    marker();
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, 'other'), 'preserve');
    await expect(clearInactiveHttpCache()).rejects.toThrow('two backends');
    expect(worker.execute).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(staged, 'other'), 'utf8')).toBe('preserve');
    expect(fs.readFileSync(path.join(source, 'sentinel'), 'utf8')).toBe('old cache');
  });
  it('keeps unknown ownership and redirects intact', async () => {
    fs.mkdirSync(profile);
    fs.writeFileSync(path.join(profile, 'owner.json'), '{"version":99}');
    await expect(clearInactiveHttpCache()).rejects.toThrow('ownership');
    expect(fs.readFileSync(path.join(source, 'sentinel'), 'utf8')).toBe('old cache');
    fs.writeFileSync(path.join(profile, 'owner.json'), JSON.stringify(owner));
    fs.symlinkSync(source, staged, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(clearInactiveHttpCache()).rejects.toThrow('Redirected');
    expect(worker.execute).not.toHaveBeenCalled();
  });
});
