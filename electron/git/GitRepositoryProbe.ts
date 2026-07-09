import { execFileSync } from 'child_process';

export class GitRepositoryProbe {
  resolveRepositoryRootSync(candidatePath: string): string {
    try {
      const rootPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      return rootPath || candidatePath;
    } catch {
      return candidatePath;
    }
  }

  detectIsBareRepositorySync(candidatePath: string): boolean {
    try {
      const output = execFileSync('git', ['rev-parse', '--is-bare-repository'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
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
