import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { LfsReader } from './GitLfsInspection';
import type { LfsContent } from './GitLfsContent';

/** Preview-only cache. Mutation inspections never receive it. */
export class GitLfsInspectionCache {
  private readonly entries = new Map<string, { value: unknown; bytes: number }>();
  private bytes = 0;
  constructor(private readonly budget = 8 * 1024 * 1024) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }
  set<T>(key: string, value: T): void {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.entries.delete(key);
    const bytes = 2 * (key.length + JSON.stringify(value).length) + 128;
    if (bytes <= this.budget) {
      this.entries.set(key, { value, bytes });
      this.bytes += bytes;
    }
    while (this.bytes > this.budget || this.entries.size > 25000) {
      const [oldest, entry] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }

  /** Verify path identity and nanosecond metadata on every access, and around a new read. */
  async file<T>(filePath: string, load: () => Promise<T>): Promise<T> {
    const before = await fileIdentity(filePath);
    if (!before) return load();
    const key = `file:${filePath}`;
    const cached = this.get<{ identity: string; value: T }>(key);
    if (cached?.identity === before) return cached.value;
    const value = await load();
    if (before === (await fileIdentity(filePath))) this.set(key, { identity: before, value });
    return value;
  }

  async index(repoPath: string, git: LfsReader): Promise<string> {
    const load = () => git.run(repoPath, ['ls-files', '--stage', '-v', '-z']);
    try {
      const index = (await git.run(repoPath, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).trim();
      if (!path.isAbsolute(index)) return load();
      // A split index has additional backing files. Read it freshly rather than
      // pretending that the worktree's index metadata alone describes it.
      if ((await fs.readdir(path.dirname(index))).some((name) => name.startsWith('sharedindex.'))) return load();
      return this.file(index, load);
    } catch {
      return load();
    }
  }

  blobs(context: string) {
    const pending = new Map<string, LfsContent>();
    return {
      get: (oid: string) => this.get<LfsContent>(`blob:${context}:${oid}`),
      set: (oid: string, content: LfsContent) => {
        pending.set(oid, content);
      },
      commit: () => {
        for (const [oid, content] of pending) this.set(`blob:${context}:${oid}`, content);
      },
    };
  }

  async objectContext(repoPath: string, git: LfsReader): Promise<string | undefined> {
    const base = process.env.GIT_REPLACE_REF_BASE || 'refs/replace';
    if (!base.startsWith('refs/')) return;
    try {
      const refs = await git.run(repoPath, ['for-each-ref', '--format=%(refname) %(objectname)', base]);
      const environment = Object.entries(process.env)
        .filter(([key]) => key.toUpperCase().startsWith('GIT_'))
        .sort(([a], [b]) => a.localeCompare(b));
      return createHash('sha256')
        .update(JSON.stringify([refs, environment]))
        .digest('hex');
    } catch {
      return;
    }
  }
}

async function fileIdentity(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.lstat(filePath, { bigint: true });
    if (!stat.isFile()) return;
    return [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].join(':');
  } catch {
    return;
  }
}
