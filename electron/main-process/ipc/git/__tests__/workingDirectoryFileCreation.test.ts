import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkingDirectoryEntrySafely } from '../workingDirectoryFileCreation';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));
vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof fs>()) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Windows working-directory entry creation', () => {
  it.runIf(process.platform === 'win32')('launches the system PowerShell even with an untrusted PATH', () => {
    vi.stubEnv('SystemRoot', 'C:\\Windows');
    vi.stubEnv('PATH', 'C:\\untrusted-repository');
    vi.spyOn(fs, 'accessSync').mockImplementation(() => {});

    createWorkingDirectoryEntrySafely('C:\\repository\\new.txt', 'file');

    expect(spawnSync).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)],
      { encoding: 'utf8', windowsHide: true },
    );
  });
});
