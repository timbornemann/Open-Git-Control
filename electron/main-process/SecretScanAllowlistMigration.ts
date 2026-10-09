import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from './atomicFile';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import type { RepositorySecretScanAllowlistService } from './RepositorySecretScanAllowlistService';
import type { SecretScanAllowlistMigrationDto } from '../../src/types/repositorySecretScanAllowlist';

type Journal = {
  version: 1;
  rules: string[];
  discardedRules: number;
  repositories: Array<{ path: string; complete: boolean; report?: SecretScanAllowlistMigrationDto }>;
};

/** The journal is private migration input, never an effective scan policy. */
export class SecretScanAllowlistMigration {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly journalPath: () => string,
    private readonly files: RepositorySecretScanAllowlistService,
    private readonly readIndexPaths: (repoPath: string) => Promise<string[]>,
  ) {}

  capture(legacy: unknown, repositories: string[]): void {
    if (legacy === undefined) return;
    if (fs.existsSync(this.journalPath())) {
      this.read();
      return;
    }
    const entries =
      typeof legacy === 'string'
        ? legacy
            .slice(0, 8000)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
        : [];
    const rules = [...new Set(entries.filter((line) => line.startsWith('path:') && line.slice(5).trim()).map((line) => line.slice(5).trim()))];
    const journal: Journal = {
      version: 1,
      rules,
      discardedRules: entries.filter((line) => !line.startsWith('path:') || !line.slice(5).trim()).length,
      repositories: [...new Set(repositories)].map((repoPath) => ({ path: repoPath, complete: false })),
    };
    this.write(journal);
  }

  private read(): Journal | null {
    try {
      const value = JSON.parse(fs.readFileSync(this.journalPath(), 'utf8')) as Journal;
      if (value.version !== 1 || !Array.isArray(value.rules) || !Array.isArray(value.repositories)) throw new Error('Invalid allowlist migration journal.');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private write(journal: Journal): void {
    writeTextFileAtomically(this.journalPath(), JSON.stringify(journal, null, 2));
  }

  private key(repoPath: string): string {
    try {
      return repositoryPathKey(fs.realpathSync(repoPath));
    } catch {
      return repositoryPathKey(repoPath);
    }
  }

  async prepare(repoPath: string): Promise<void> {
    const key = this.key(repoPath);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const migration = this.migrate(repoPath, key).finally(() => this.pending.delete(key));
    this.pending.set(key, migration);
    return migration;
  }

  private async migrate(repoPath: string, key: string): Promise<void> {
    const journal = this.read();
    const entry = journal?.repositories.find((candidate) => this.key(candidate.path) === key);
    if (!journal || !entry || entry.complete) return;
    const current = this.files.readForEditing(repoPath);
    const matching: string[] = [];
    if (!current.exists) {
      const indexPaths = await this.readIndexPaths(current.repoPath);
      for (const rule of journal.rules) {
        const relativePath = this.match(rule, current.repoPath, indexPaths, [repoPath, entry.path]);
        if (relativePath && !matching.includes(relativePath)) matching.push(relativePath);
      }
      // A crash after publication is safe: the next run preserves the file.
      if (matching.length) this.files.addPaths(current.repoPath, matching, current.version);
    }
    const latest = this.read();
    if (!latest) throw new Error('Allowlist migration journal disappeared.');
    for (const candidate of latest.repositories.filter((candidate) => this.key(candidate.path) === key)) {
      candidate.complete = true;
      candidate.report = {
        importedRules: matching.length,
        discardedRules: current.exists ? 0 : journal.discardedRules + journal.rules.length - matching.length,
        preservedExisting: current.exists,
      };
    }
    // Keep completion markers, but discard legacy rule text once no known repo
    // needs it. Deleted files must not resurrect a previously migrated policy.
    if (latest.repositories.every((candidate) => candidate.complete)) latest.rules = [];
    this.write(latest);
  }

  private match(rule: string, repoPath: string, indexPaths: string[], aliases: string[]): string | null {
    const normalized = rule.replace(/\\/g, '/');
    // The policy service returns a physical root, but legacy absolute rules may
    // use a saved alias such as macOS /var instead of /private/var. Resolve only
    // the repository root: resolving the entire rule would follow inner
    // symlinks, or fail for deleted files that still belong to the index.
    const candidates = path.isAbsolute(normalized)
      ? [...new Set([repoPath, ...aliases])]
          .filter((alias) => this.key(alias) === this.key(repoPath))
          .map((alias) => path.relative(alias, normalized).replace(/\\/g, '/'))
      : [normalized];
    const relativePath = candidates.find(
      (candidate) =>
        candidate && !candidate.startsWith('/') && !/^[a-z]:/i.test(candidate) && !candidate.split('/').some((part) => part === '..' || part === '.'),
    );
    if (!relativePath) return null;
    const parts = relativePath.split('/');
    const destination = path.join(repoPath, relativePath);
    try {
      // Reject symlinks at every component rather than assigning rules to a
      // file that actually belongs to a different repository.
      let current = repoPath;
      for (const part of parts) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) return null;
      }
      const stats = fs.statSync(destination);
      return stats.isFile() || stats.isDirectory() ? relativePath : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const key = process.platform === 'win32' ? relativePath.toLowerCase() : relativePath;
      return indexPaths.some((entry) => {
        const candidate = process.platform === 'win32' ? entry.toLowerCase() : entry;
        return candidate === key || candidate.startsWith(`${key.replace(/\/$/, '')}/`);
      })
        ? relativePath
        : null;
    }
  }

  consumeReport(repoPath: string): SecretScanAllowlistMigrationDto | undefined {
    const journal = this.read();
    const entry = journal?.repositories.find((candidate) => this.key(candidate.path) === this.key(repoPath) && candidate.report);
    if (!journal || !entry?.report) return undefined;
    const report = entry.report;
    delete entry.report;
    this.write(journal);
    return report;
  }
}
