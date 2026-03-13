import { execFile, spawn } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const execFileAsync = util.promisify(execFile);

export type CommitStats = { files: number; additions: number; deletions: number };

export class GitService {
  private repoPath: string | null = null;

  setRepoPath(newPath: string) {
    this.repoPath = newPath;
  }

  getRepoPath(): string | null {
    return this.repoPath;
  }

  private ensureRepoPath(): string {
    if (!this.repoPath) {
      throw new Error('No repository path set.');
    }
    return this.repoPath;
  }

  private normalizeGitError(error: any, args: string[]): Error {
    const gitOut = (error?.stderr || '').trim() || (error?.stdout || '').trim();
    const detailedMessage = gitOut ? `${error.message}\nGit Output: ${gitOut}` : String(error?.message || 'Unknown git error');
    console.error(`Git Error executing "git ${args.join(' ')}":`, detailedMessage);
    return new Error(detailedMessage);
  }

  /**
   * Fuehrt einen Git Befehl im ausgewaehlten Repository aus
   */
  async runCommand(args: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();

    try {
      const { stdout } = await execFileAsync('git', args, { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
      return stdout.trimEnd();
    } catch (error: any) {
      throw this.normalizeGitError(error, args);
    }
  }

  /**
   * Fuehrt einen Git-Befehl in einem expliziten Repository-Pfad aus.
   */
  async runCommandAtPath(repoPath: string, args: string[]): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }

    try {
      const { stdout } = await execFileAsync('git', args, { cwd: normalizedPath, maxBuffer: 20 * 1024 * 1024 });
      return stdout.trimEnd();
    } catch (error: any) {
      throw this.normalizeGitError(error, args);
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
   * Startet einen interaktiven Rebase mit einer vorgegebenen Todo-Liste.
   */
  async startInteractiveRebase(baseHash: string, todoLines: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();
    const normalizedBase = (baseHash || '').trim();
    if (!normalizedBase) {
      throw new Error('Base commit hash is required for interactive rebase.');
    }

    const normalizedLines = Array.isArray(todoLines)
      ? todoLines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
      : [];

    if (normalizedLines.length === 0) {
      throw new Error('At least one rebase todo line is required.');
    }

    const todoText = normalizedLines.join('\n') + '\n';
    const helperPath = path.join(os.tmpdir(), `ogc-rebase-editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.js`);
    const helperScript = [
      "const fs = require('fs');",
      "const target = process.argv[2];",
      "if (!target) process.exit(1);",
      "const raw = process.env.OGC_REBASE_TODO_B64 || '';",
      "const content = Buffer.from(raw, 'base64').toString('utf8');",
      "fs.writeFileSync(target, content, 'utf8');",
    ].join('\n');

    fs.writeFileSync(helperPath, helperScript, 'utf8');

    const quotedNode = `\"${process.execPath.replace(/\"/g, '\\\"')}\"`;
    const quotedHelper = `\"${helperPath.replace(/\"/g, '\\\"')}\"`;

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rebase', '-i', normalizedBase],
        {
          cwd: repoPath,
          maxBuffer: 20 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_SEQUENCE_EDITOR: `${quotedNode} ${quotedHelper}`,
            OGC_REBASE_TODO_B64: Buffer.from(todoText, 'utf8').toString('base64'),
          },
        },
      );

      return stdout.trimEnd();
    } catch (error: any) {
      throw this.normalizeGitError(error, ['rebase', '-i', normalizedBase]);
    } finally {
      try {
        fs.rmSync(helperPath, { force: true });
      } catch {
        // ignore temp cleanup errors
      }
    }
  }

  /**
   * Wendet ein Patch auf Working Tree oder Index an.
   */
  async applyPatch(patchText: string, options?: { cached?: boolean; reverse?: boolean }): Promise<string> {
    const repoPath = this.ensureRepoPath();
    const patch = String(patchText || '');
    if (!patch.trim()) {
      throw new Error('Patch content is empty.');
    }

    const args = ['apply', '--recount', '--whitespace=nowarn'];
    if (options?.cached) {
      args.push('--cached');
    }
    if (options?.reverse) {
      args.push('-R');
    }

    return await new Promise<string>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trimEnd());
          return;
        }

        const message = (stderr || stdout || `git apply exited with code ${code}`).trim();
        reject(new Error(message));
      });

      proc.stdin.write(patch);
      proc.stdin.end();
    });
  }

  async getRepoOriginUrl(repoPath: string): Promise<string | null> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) return null;

    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: normalizedPath,
        maxBuffer: 20 * 1024 * 1024,
      });
      const trimmed = String(stdout || '').trim();
      return trimmed || null;
    } catch {
      // Missing origin is a normal state for local-only repos. Do not spam console errors.
      return null;
    }
  }

  async getStashes(limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    return this.runCommand(['stash', 'list', `--max-count=${safeLimit}`]);
  }

  async getSubmoduleStatus(): Promise<string> {
    return this.runCommand(['submodule', 'status', '--recursive']);
  }

  async updateSubmodulesInitRecursive(): Promise<string> {
    return this.runCommand(['submodule', 'update', '--init', '--recursive']);
  }

  async syncSubmodulesRecursive(): Promise<string> {
    return this.runCommand(['submodule', 'sync', '--recursive']);
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
  private getStructuredLogFormat(): string {
    return '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';
  }

  async getLog(limit: number = 50, includeAll: boolean = true, offset: number = 0): Promise<string> {
    // NUL separates commits (with -z) and US (\x1f) separates fixed fields.
    // Refs use GS (\x1d) as an explicit separator to avoid ambiguities.
    const format = this.getStructuredLogFormat();
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const args = ['log', '--topo-order', '-z', '-' + limit, `--skip=${safeOffset}`, '--pretty=format:' + format, '--date=iso', '--numstat'];

    if (includeAll) {
      args.splice(1, 0, '--all');
    }

    return this.runCommand(args);
  }

  async getForensicHistoryByString(search: string, filePath: string, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    const format = this.getStructuredLogFormat();
    return this.runCommand([
      'log',
      '-z',
      `-${safeLimit}`,
      '--date=iso',
      `--pretty=format:${format}`,
      '--numstat',
      '-S',
      search,
      '--',
      filePath,
    ]);
  }

  async getForensicHistoryByRegex(regex: string, filePath: string, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    const format = this.getStructuredLogFormat();
    return this.runCommand([
      'log',
      '-z',
      `-${safeLimit}`,
      '--date=iso',
      `--pretty=format:${format}`,
      '--numstat',
      '-G',
      regex,
      '--',
      filePath,
    ]);
  }

  async getForensicHistoryByLineRange(filePath: string, startLine: number, endLine: number, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    return this.runCommand([
      'log',
      `-${safeLimit}`,
      '--date=iso',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00',
      `-L${startLine},${endLine}:${filePath}`,
    ]);
  }

  /**
   * Liefert Reflog-Eintraege in einem stabil parsebaren Format.
   */
  async getReflog(limit: number = 300): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 300;
    const format = '%H%x1f%h%x1f%gd%x1f%gs%x1f%cd%x00';
    return this.runCommand([
      'reflog',
      '--date=iso',
      `--max-count=${safeLimit}`,
      '--pretty=format:' + format,
    ]);
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
