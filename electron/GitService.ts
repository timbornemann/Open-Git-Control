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
   * Führt einen Git Befehl im ausgewählten Repository aus
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
   * Überprüft, ob das aktuelle Verzeichnis ein Git Repo ist
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
   * Gibt den aktuellen Status zurück (Short Format)
   */
  async getStatus(): Promise<string> {
    return this.runCommand(['status', '--short']);
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
  async getLog(limit: number = 50): Promise<string> {
    // Use ASCII separators that are very unlikely to appear in commit messages.
    // RS (\x1e) separates commits and US (\x1f) separates fields.
    const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%D%x1e';
    return this.runCommand([
      'log',
      '--all',
      '--topo-order',
      `-${limit}`,
      `--pretty=format:${format}`,
      '--date=iso'
    ]);
  }

  /**
   * Holt die Details eines einzelnen Commits (veränderte Dateien)
   */
  async getCommitDetails(hash: string): Promise<string> {
    // Liefert Status (A, M, D) und Dateipfad (-M, --name-status)
    return this.runCommand(['show', '--name-status', '--format=', hash]);
  }
  /**
   * Klont ein Repository mit Fortschrittsanzeige
   */
  cloneRepo(
    cloneUrl: string, 
    targetDir: string, 
    onProgress: (line: string) => void
  ): Promise<{ success: boolean; repoPath: string; error?: string }> {
    return new Promise((resolve) => {
      // Extract repo name from URL for the target folder
      const repoName = cloneUrl.replace(/\.git$/, '').split('/').pop() || 'repo';
      const repoPath = path.join(targetDir, repoName);

      const proc = spawn('git', ['clone', '--progress', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe']
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
