import { spawn } from 'node:child_process';
import * as os from 'node:os';
import type { ResolvedToolInstall } from './ToolInstallPlans';
import { runElevatedWindowsTool } from './WindowsToolElevation';

export type InstallerResult = { exitCode: number; output: string };
export type InstallerRunner = (executable: string, args: string[]) => Promise<InstallerResult>;
export const runInstaller: InstallerRunner = (executable, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: os.homedir(), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-24000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('close', (code) => resolve({ exitCode: code ?? 1, output: output.trim() }));
  });
const wingetCode = (result: InstallerResult, code: number) => result.exitCode >>> 0 === code;
export const requiresAgreements = (result: InstallerResult) => wingetCode(result, 0x8a150041) || wingetCode(result, 0x8a150046);
export const installationCancelled = (result: InstallerResult, method: string) =>
  method === 'winget' ? wingetCode(result, 0x8a150005) || /cancelled|canceled|0x800704c7/i.test(result.output) : result.exitCode === 126;

export async function executeToolInstall(install: ResolvedToolInstall, acceptAgreements: boolean, run: InstallerRunner): Promise<InstallerResult> {
  const args = [...install.args];
  if (acceptAgreements && install.plan.method === 'winget') args.push('--accept-source-agreements', '--accept-package-agreements');
  let result = await run(install.executable, args);
  if (install.plan.method === 'winget' && wingetCode(result, 0x8a150019)) {
    result = await runElevatedWindowsTool(install.executable, args, run);
  }
  return result;
}
