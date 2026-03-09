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
      return stdout.trim();
    } catch (error: any) {
      console.error(`Git Error executing "git ${args.join(' ')}":`, error.message);
      throw error;
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
    // Format: Hash|AbbrevHash|Author|Date|Subject|Parents|Refs
    const format = '%H|%h|%an|%ad|%s|%P|%D';
    return this.runCommand(['log', `-${limit}`, `--pretty=format:${format}`, '--date=iso']);
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
