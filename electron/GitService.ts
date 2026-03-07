import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';

const execAsync = util.promisify(exec);

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

    const command = `git ${args.join(' ')}`;
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.repoPath });
      if (stderr && !stdout) {
         // Some git commands output to stderr even on success, but generally we return stdout
      }
      return stdout.trim();
    } catch (error: any) {
      console.error(`Git Error executing "${command}":`, error.message);
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
    // Format: Hash|AbbrevHash|Author|Date|Subject
    const format = '%H|%h|%an|%ad|%s';
    return this.runCommand(['log', `-${limit}`, `--pretty=format:${format}`, '--date=iso']);
  }
}

// Singleton Instanz
export const gitService = new GitService();
