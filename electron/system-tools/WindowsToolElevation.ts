import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { InstallerResult, InstallerRunner } from './ToolInstaller';

/** Capture elevated output too, so UAC cannot hide package terms or failures. */
export async function runElevatedWindowsTool(executable: string, args: string[], run: InstallerRunner): Promise<InstallerResult> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ogc-tool-install-'));
  const logFile = path.join(directory, 'installer.log');
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Only fixed main-process package plans and a private log path reach this script.
  const inner = `& ${quote(executable)} @(${args.map(quote).join(',')}) 2>&1 | Out-File -LiteralPath ${quote(logFile)} -Encoding utf8; exit $LASTEXITCODE`;
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  const script = `$ErrorActionPreference = 'Stop'; $p = Start-Process -FilePath ${quote(powershell)} -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',${quote(encoded)}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
  try {
    const result = await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', script]);
    try {
      const file = await fs.open(logFile, 'r');
      try {
        const { size } = await file.stat();
        const bytes = Buffer.alloc(Math.min(size, 24000));
        await file.read(bytes, 0, bytes.length, Math.max(0, size - bytes.length));
        return {
          ...result,
          output:
            bytes
              .toString('utf8')
              .replace(/^\uFEFF/, '')
              .trim() || result.output,
        };
      } finally {
        await file.close();
      }
    } catch {
      return result;
    }
  } finally {
    await fs.unlink(logFile).catch(() => {});
    await fs.rmdir(directory).catch(() => {});
  }
}
