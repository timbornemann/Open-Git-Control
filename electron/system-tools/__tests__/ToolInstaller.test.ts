import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { installationCancelled, runInstaller, type InstallerRunner } from '../ToolInstaller';
import { runElevatedWindowsTool } from '../WindowsToolElevation';

describe('installer process boundaries', () => {
  it('captures bounded output from a simulated installer process without a shell', async () => {
    const result = await runInstaller(process.execPath, ['-e', 'process.stdout.write("x".repeat(30000)); process.stderr.write("end"); process.exitCode = 7;']);
    expect(result.exitCode).toBe(7);
    expect(result.output.length).toBeLessThanOrEqual(24000);
    expect(result.output.endsWith('end')).toBe(true);
  }, 10000);
  it('preserves elevated package terms and removes only its own temporary log', async () => {
    let logFile = '';
    const run = vi.fn<InstallerRunner>(async (_exe, args) => {
      const encoded = /'-EncodedCommand','([^']+)'/.exec(args[3])![1];
      const inner = Buffer.from(encoded, 'base64').toString('utf16le');
      expect(inner).toContain("& 'C:\\tools\\winget.exe' @('install','--id','Git.Git')");
      logFile = /Out-File -LiteralPath '([^']+)'/.exec(inner)![1];
      await fs.writeFile(logFile, '\uFEFFPackage license terms and download failure', 'utf8');
      return { exitCode: 0x8a150041, output: '' };
    });
    expect(await runElevatedWindowsTool('C:\\tools\\winget.exe', ['install', '--id', 'Git.Git'], run)).toEqual({
      exitCode: 0x8a150041,
      output: 'Package license terms and download failure',
    });
    await expect(fs.stat(logFile)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(run.mock.calls[0][1].join(' ')).toContain('-Verb RunAs -WindowStyle Hidden');
  });
  it('distinguishes cancelled rights from an authorization or network error', () => {
    expect(installationCancelled({ exitCode: 126, output: '' }, 'apt-get')).toBe(true);
    expect(installationCancelled({ exitCode: 127, output: 'No authentication agent' }, 'apt-get')).toBe(false);
    expect(installationCancelled({ exitCode: 1, output: '0x800704c7' }, 'winget')).toBe(true);
    expect(installationCancelled({ exitCode: 1, output: 'Network error' }, 'winget')).toBe(false);
  });
});
