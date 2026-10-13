import { toolExecutable, toolEnvironment } from '../system-tools/toolRuntime';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitRepositoryProbe {
  async detectIsBareRepository(candidatePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(toolExecutable('git'), ['rev-parse', '--is-bare-repository'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        env: toolEnvironment(),
        timeout: 10_000,
      });
      return stdout.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  }
  resolveRepositoryRootSync(candidatePath: string): string {
    try {
      const rootPath = execFileSync(toolExecutable('git'), ['rev-parse', '--show-toplevel'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        env: toolEnvironment(),
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      return rootPath || candidatePath;
    } catch {
      return candidatePath;
    }
  }

  detectIsBareRepositorySync(candidatePath: string): boolean {
    try {
      const output = execFileSync(toolExecutable('git'), ['rev-parse', '--is-bare-repository'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        env: toolEnvironment(),
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .toLowerCase();
      return output === 'true';
    } catch {
      return false;
    }
  }
}
