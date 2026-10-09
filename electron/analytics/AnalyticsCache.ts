import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { RepositoryAnalyticsSnapshot } from '../../src/shared/ipc/repositoryAnalytics';
import type { AnalyticsCacheData, CommitRecord, BlobRecord, BlameRecord } from './AnalyticsTypes';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const oid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value);
function validCommit(record: CommitRecord): boolean {
  return (
    oid(record?.hash) &&
    Array.isArray(record.parents) &&
    record.parents.every(oid) &&
    typeof record.author?.name === 'string' &&
    typeof record.author.id === 'string' &&
    typeof record.author.email === 'string' &&
    Number.isFinite(record.date) &&
    typeof record.subject === 'string' &&
    Array.isArray(record.changes) &&
    record.changes.every(
      (change) =>
        typeof change.path === 'string' &&
        typeof change.mode === 'string' &&
        typeof change.status === 'string' &&
        typeof change.binary === 'boolean' &&
        !change.path.includes('\0') &&
        oid(change.before) &&
        oid(change.after) &&
        Number.isSafeInteger(change.additions) &&
        change.additions >= 0 &&
        Number.isSafeInteger(change.deletions) &&
        change.deletions >= 0,
    )
  );
}
export class AnalyticsCache {
  readonly directory: string;
  readonly data: AnalyticsCacheData = { commits: new Map(), blobs: new Map(), blame: new Map(), classified: new Set(), snapshot: null };
  private queued: string[] = [];
  constructor(root: string, repoPath: string, context: string) {
    const physical = fs.realpathSync.native(repoPath);
    this.directory = path.join(root, 'v1', digest(process.platform === 'win32' ? physical.toLowerCase() : physical), digest(context));
  }
  static snapshotPath(root: string, repoPath: string): string {
    const physical = fs.realpathSync.native(repoPath);
    return path.join(root, 'v1', digest(process.platform === 'win32' ? physical.toLowerCase() : physical), 'snapshot.json');
  }
  static readSnapshot(root: string, repoPath: string): RepositoryAnalyticsSnapshot | null {
    try {
      const file = this.snapshotPath(root, repoPath);
      if (fs.statSync(file).size > 8 * 1024 * 1024) return null;
      const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as RepositoryAnalyticsSnapshot;
      return typeof snapshot.id === 'string' &&
        snapshot.repoPath === repoPath &&
        snapshot.filters &&
        Array.isArray(snapshot.hotspots) &&
        Array.isArray(snapshot.warnings) &&
        Array.isArray(snapshot.contributors) &&
        Array.isArray(snapshot.authors) &&
        Array.isArray(snapshot.refs) &&
        Array.isArray(snapshot.tags) &&
        Array.isArray(snapshot.periods) &&
        Array.isArray(snapshot.calendar) &&
        Array.isArray(snapshot.coupling) &&
        Array.isArray(snapshot.directories) &&
        Array.isArray(snapshot.sections) &&
        Number.isFinite(snapshot.totals?.commits) &&
        snapshot.project &&
        Array.isArray(snapshot.project.languages) &&
        Array.isArray(snapshot.project.ownership) &&
        Number.isFinite(snapshot.savedAt)
        ? snapshot
        : null;
    } catch {
      return null;
    }
  }
  async load(): Promise<void> {
    fs.mkdirSync(this.directory, { recursive: true });
    const file = path.join(this.directory, 'records.jsonl');
    if (!fs.existsSync(file)) return;
    const lines = createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      try {
        const entry = JSON.parse(line) as { type: string; value: CommitRecord & BlobRecord & BlameRecord };
        if (entry.type === 'commit' && validCommit(entry.value)) this.data.commits.set(entry.value.hash, entry.value);
        if (entry.type === 'classified' && oid(entry.value?.oid)) this.data.classified.add(entry.value.oid);
        if (
          entry.type === 'blob' &&
          oid(entry.value?.oid) &&
          ['text', 'binary', 'lfs'].includes(entry.value.kind) &&
          Number.isSafeInteger(entry.value.lines) &&
          entry.value.lines >= 0
        )
          this.data.blobs.set(entry.value.oid, entry.value);
        if (
          entry.type === 'blame' &&
          oid(entry.value?.revision) &&
          oid(entry.value.oid) &&
          typeof entry.value.path === 'string' &&
          Array.isArray(entry.value.authors) &&
          entry.value.authors.every(
            (author) =>
              Number.isSafeInteger(author.lines) &&
              author.lines >= 0 &&
              typeof author.id === 'string' &&
              typeof author.name === 'string' &&
              typeof author.email === 'string',
          )
        )
          this.data.blame.set(`${entry.value.revision}\0${entry.value.path}`, entry.value);
      } catch {
        /* An interrupted final record is not a completed calculation. */
      }
    }
  }
  put(type: 'commit', value: CommitRecord): void;
  put(type: 'blob', value: BlobRecord): void;
  put(type: 'blame', value: BlameRecord): void;
  put(type: 'classified', value: { oid: string }): void;
  put(type: string, value: CommitRecord | BlobRecord | BlameRecord | { oid: string }): void {
    if (type === 'commit') this.data.commits.set((value as CommitRecord).hash, value as CommitRecord);
    if (type === 'blob') this.data.blobs.set((value as BlobRecord).oid, value as BlobRecord);
    if (type === 'classified') this.data.classified.add((value as { oid: string }).oid);
    if (type === 'blame') {
      const blame = value as BlameRecord;
      this.data.blame.set(`${blame.revision}\0${blame.path}`, blame);
    }
    this.queued.push(JSON.stringify({ type, value }));
    if (this.queued.length >= 128) this.flush();
  }
  flush(): void {
    if (!this.queued.length) return;
    const file = path.join(this.directory, 'records.jsonl');
    // Begin with a delimiter, so an interrupted last record never consumes the next valid record.
    fs.appendFileSync(file, '\n' + this.queued.join('\n') + '\n', { mode: 0o600 });
    this.queued = [];
  }
  saveSnapshot(root: string, snapshot: RepositoryAnalyticsSnapshot): void {
    this.flush();
    const file = AnalyticsCache.snapshotPath(root, snapshot.repoPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    this.data.snapshot = snapshot;
  }
  discardRecords(): void {
    this.queued = [];
    const file = path.join(this.directory, 'records.jsonl');
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
