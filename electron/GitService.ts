import { execFile, spawn } from 'child_process';
import * as util from 'util';
import * as path from 'path';

const execFileAsync = util.promisify(execFile);

export class GitService {
  private repoPath: string | null = null;

  setRepoPath(newPath: string) {
    this.repoPath = newPath;
  }

  getRepoPath(): string | null {
    return this.repoPath;
  }

  /**
   * Fuehrt einen Git Befehl im ausgewaehlten Repository aus
   */
  async runCommand(args: string[]): Promise<string> {
    if (!this.repoPath) {
      throw new Error('No repository path set.');
    }

    try {
      const { stdout } = await execFileAsync('git', args, { cwd: this.repoPath });
      return stdout.trimEnd();
    } catch (error: any) {
      // execFile errors include stdout and stderr properties
      const gitOut = (error.stderr || '').trim() || (error.stdout || '').trim();
      const detailedMessage = gitOut ? `${error.message}\nGit Output: ${gitOut}` : error.message;
      console.error(`Git Error executing "git ${args.join(' ')}":`, detailedMessage);

      // We throw an Error so it normalizes for IPC handling in main.ts
      throw new Error(detailedMessage);
    }
  }

  /**
   * Ueberprueft, ob das aktuelle Verzeichnis ein Git Repo ist
   */
  async checkIsRepo(): Promise<boolean> {
    try {
      await this.runCommand(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gibt den aktuellen Status zurueck (Short Format)
   */
  async getStatus(): Promise<string> {
    return this.runCommand(['status', '--short']);
  }

  /**
   * Gibt den aktuellen Status im Porcelain-v1-Format zurueck.
   * Dieses Format ist stabil und fuer UI-Parsing geeignet.
   */
  async getStatusPorcelain(): Promise<string> {
    // -uall lists each untracked file individually instead of collapsing directories.
    return this.runCommand(['status', '--porcelain=v1', '--untracked-files=all']);
  }

  /**
   * Nimmt bei einer Konfliktdatei die lokale (ours) oder entfernte (theirs) Variante.
   */
  async checkoutConflictVersion(filePath: string, side: 'ours' | 'theirs'): Promise<string> {
    return this.runCommand(['checkout', '--' + side, '--', filePath]);
  }

  /**
   * Markiert eine Datei nach Konfliktaufloesung als geloest (staged).
   */
  async addFile(filePath: string): Promise<string> {
    return this.runCommand(['add', '--', filePath]);
  }

  /**
   * Setzt einen laufenden Merge nach Konfliktaufloesung fort.
   */
  async continueMerge(): Promise<string> {
    return this.runCommand(['merge', '--continue']);
  }

  /**
   * Bricht einen laufenden Merge ab.
   */
  async abortMerge(): Promise<string> {
    return this.runCommand(['merge', '--abort']);
  }

  /**
   * Setzt einen laufenden Rebase nach Konfliktaufloesung fort.
   */
  async continueRebase(): Promise<string> {
    return this.runCommand(['rebase', '--continue']);
  }

  /**
   * Bricht einen laufenden Rebase ab.
   */
  async abortRebase(): Promise<string> {
    return this.runCommand(['rebase', '--abort']);
  }

  /**
   * Holt die Branch-Liste
   */
  async getBranches(): Promise<string> {
    return this.runCommand(['branch', '-a']);
  }

  /**
   * Holt das Git Log in einem einfach parsebaren Format
   */
  async getLog(limit: number = 50, includeAll: boolean = true): Promise<string> {
    // NUL separates commits (with -z) and US (\x1f) separates fixed fields.
    // Refs use GS (\x1d) as an explicit separator to avoid ambiguities.
    const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';
    const args = ['log', '--topo-order', '-z', '-' + limit, '--pretty=format:' + format, '--date=iso'];

    if (includeAll) {
      args.splice(1, 0, '--all');
    }

    return this.runCommand(args);
  }

  /**
   * Holt die Details eines einzelnen Commits (veraenderte Dateien)
   */
  async getCommitDetails(hash: string): Promise<string> {
    // Liefert Status (A, M, D) und Dateipfad (-M, --name-status)
    return this.runCommand(['show', '--name-status', '--format=', hash]);
  }

  /**
   * Liefert die Historie einer einzelnen Datei.
   */
  async getFileHistory(filePath: string, limit: number = 100, commitHash?: string): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x00';
    const args = [
      'log',
      '--follow',
      '-z',
      `-${safeLimit}`,
      `--pretty=format:${format}`,
      '--date=iso',
    ];

    if (commitHash) {
      args.push(commitHash);
    }

    args.push('--', filePath);
    return this.runCommand(args);
  }

  /**
   * Liefert Blame-Informationen einer Datei.
   */
  async getFileBlame(filePath: string, commitHash?: string): Promise<string> {
    const args = ['blame', '--line-porcelain'];
    if (commitHash) {
      args.push(commitHash);
    }
    args.push('--', filePath);
    return this.runCommand(args);
  }

  /**
   * Klont ein Repository mit Fortschrittsanzeige
   */
  cloneRepo(
    cloneUrl: string,
    targetDir: string,
    onProgress: (line: string) => void,
  ): Promise<{ success: boolean; repoPath: string; error?: string }> {
    return new Promise((resolve) => {
      // Extract repo name from URL for the target folder
      const repoName = cloneUrl.replace(/\.git$/, '').split('/').pop() || 'repo';
      const repoPath = path.join(targetDir, repoName);

      const proc = spawn('git', ['clone', '--progress', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Git clone sends progress to stderr
      proc.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split(/\r?\n|\r/);
        for (const line of lines) {
          if (line.trim()) {
            onProgress(line.trim());
          }
        }
      });

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split(/\r?\n|\r/);
        for (const line of lines) {
          if (line.trim()) {
            onProgress(line.trim());
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, repoPath });
        } else {
          resolve({ success: false, repoPath, error: `Git clone beendet mit Exit Code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, repoPath, error: err.message });
      });
    });
  }
}

// Singleton Instanz
export const gitService = new GitService();

