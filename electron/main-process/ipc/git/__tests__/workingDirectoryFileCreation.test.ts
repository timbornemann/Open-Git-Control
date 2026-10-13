import * as fs from 'fs';
import { execFile } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkingDirectoryEntrySafely } from '../workingDirectoryFileCreation';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('child_process', () => ({ execFile: vi.fn((_file, _args, _options, callback) => callback(null, '', '')) }));
vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof fs>()) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Windows working-directory entry creation', () => {
  it.runIf(process.platform === 'win32')('launches the system PowerShell asynchronously even with an untrusted PATH', async () => {
    vi.stubEnv('SystemRoot', 'C:\\Windows');
    vi.stubEnv('PATH', 'C:\\untrusted-repository');
    vi.spyOn(fs.promises, 'access').mockResolvedValue();

    await createWorkingDirectoryEntrySafely('C:\\repository\\new.txt', 'file');

    expect(execFile).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
      expect.any(Function),
    );
  });
});
