import { execFile } from 'node:child_process';
import * as os from 'node:os';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export type ToolProcessResult = { stdout: string; stderr: string };
export type ToolProcessRunner = (executable: string, args: string[], timeout?: number) => Promise<ToolProcessResult>;
export const runToolProcess: ToolProcessRunner = async (executable, args, timeout = 8000) => {
  const result = await execute(executable, args, {
    cwd: os.homedir(),
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    windowsHide: true,
    timeout,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};
