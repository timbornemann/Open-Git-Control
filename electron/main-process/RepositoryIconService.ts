import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { writeTextFileAtomically } from './atomicFile';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { resolveExistingRepositoryPathWithoutSymlinks, normalizeRepositoryRelativePath } from '../git/RepositoryPathSafety';
import { discoverRepositoryIcons, readRepositoryIconSource } from './repositoryIconDiscovery';
import type { RepositoryIconCacheRequestDto, RepositoryIconChoiceDto, RepositoryIconStateDto } from '../../src/shared/repositoryIcons';

type IconRecord = RepositoryIconStateDto & {
  checkedAt: number;
  scannedAt: number;
  stamp: { bytes: number; mtimeMs: number } | null;
  alive: boolean;
  loaded: Promise<void>;
};
type Deps = { directory: string; storedPaths: () => string[]; validatePng: (dataUrl: string) => string; now?: () => number };
export class RepositoryIconService {
  private records = new Map<string, IconRecord>();
  private listeners = new Set<(state: RepositoryIconStateDto) => void>();
  private jobs: Array<() => Promise<void>> = [];
  private running = 0;
  private validations = new Map<IconRecord, Promise<void>>();
  private readonly now: () => number;
  constructor(private readonly deps: Deps) {
    this.now = deps.now || Date.now;
  }
  subscribe(listener: (state: RepositoryIconStateDto) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private file(repo: string) {
    return path.join(this.deps.directory, `${createHash('sha256').update(repositoryPathKey(repo)).digest('hex')}.json`);
  }
  private allowed(repo: string) {
    if (typeof repo !== 'string' || !repo.trim() || !path.isAbsolute(repo)) throw new Error('An absolute saved repository path is required.');
    const saved = this.deps.storedPaths().find((candidate) => repositoryPathKey(candidate) === repositoryPathKey(repo));
    if (!saved) throw new Error('Repository logos are only available for saved repositories.');
    return saved;
  }
  private current(record: IconRecord) {
    this.allowed(record.repoPath);
    if (!record.alive || this.records.get(repositoryPathKey(record.repoPath)) !== record) throw new Error('Repository logo context changed.');
  }
  private snapshot(record: IconRecord): RepositoryIconStateDto {
    const { repoPath, mode, manualPath, selectionVersion, revision, thumbnail, candidates, limited, status, error } = record;
    return {
      repoPath,
      mode,
      manualPath,
      selectionVersion,
      revision,
      thumbnail: thumbnail && { ...thumbnail },
      candidates: [...candidates],
      limited,
      status,
      error,
    };
  }
  private changed(record: IconRecord) {
    this.current(record);
    record.revision++;
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot(record));
      } catch {
        /* A closed window cannot invalidate a successful update. */
      }
    }
  }
  private persist(record: IconRecord) {
    this.current(record);
    writeTextFileAtomically(
      this.file(record.repoPath),
      JSON.stringify({ version: 1, ...this.snapshot(record), stamp: record.stamp, scannedAt: record.scannedAt }),
    );
  }
  private async record(repo: string) {
    const repoPath = this.allowed(repo),
      key = repositoryPathKey(repoPath);
    let record = this.records.get(key);
    if (!record) {
      record = {
        repoPath,
        mode: 'auto',
        manualPath: null,
        selectionVersion: randomUUID(),
        revision: 1,
        thumbnail: null,
        candidates: [],
        limited: false,
        status: 'ready',
        error: null,
        stamp: null,
        checkedAt: -Infinity,
        scannedAt: -Infinity,
        alive: true,
        loaded: Promise.resolve(),
      };
      this.records.set(key, record);
      const loading = record;
      loading.loaded = this.load(loading);
    }
    await record.loaded;
    this.current(record);
    return record;
  }
  private async load(record: IconRecord) {
    try {
      const file = this.file(record.repoPath);
      if ((await fs.stat(file)).size > 2 * 1024 * 1024) return;
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      this.current(record);
      if (data.version !== 1 || repositoryPathKey(String(data.repoPath || '')) !== repositoryPathKey(record.repoPath)) return;
      if (!['auto', 'manual', 'initials'].includes(data.mode)) return;
      const manualPath = data.mode === 'manual' ? normalizeRepositoryRelativePath(data.manualPath) : null;
      const thumbnail =
        data.thumbnail && typeof data.thumbnail.path === 'string' && typeof data.thumbnail.version === 'string'
          ? {
              path: normalizeRepositoryRelativePath(data.thumbnail.path),
              version: data.thumbnail.version,
              dataUrl: this.deps.validatePng(data.thumbnail.dataUrl),
            }
          : null;
      Object.assign(record, {
        mode: data.mode,
        manualPath,
        thumbnail: data.mode === 'initials' ? null : thumbnail,
        stamp: data.stamp || null,
        candidates: Array.isArray(data.candidates)
          ? data.candidates.filter((item: unknown) => typeof item === 'string').map((item: string) => normalizeRepositoryRelativePath(item))
          : [],
        selectionVersion: typeof data.selectionVersion === 'string' ? data.selectionVersion : randomUUID(),
        revision: Number.isSafeInteger(data.revision) ? data.revision + 1 : 1,
        scannedAt: Number.isFinite(data.scannedAt) ? data.scannedAt : -Infinity,
        limited: Boolean(data.limited),
      });
    } catch {
      /* Missing or corrupt cache starts with automatic discovery. */
    }
  }
  async get(repo: string, rescan = false) {
    const record = await this.record(repo);
    if (rescan) await this.validate(record, true);
    else if (record.mode !== 'initials' && this.now() - record.checkedAt >= 60_000) void this.validate(record, false);
    return this.snapshot(record);
  }
  private drain() {
    while (this.running < 2 && this.jobs.length) {
      this.running++;
      void this.jobs.shift()!().finally(() => {
        this.running--;
        this.drain();
      });
    }
  }
  private validate(record: IconRecord, force: boolean): Promise<void> {
    const existing = this.validations.get(record);
    if (existing) return force ? existing.then(() => this.validate(record, true)) : existing;
    const promise = new Promise<void>((resolve) => {
      this.jobs.push(async () => {
        try {
          await this.check(record, force);
        } finally {
          this.validations.delete(record);
          resolve();
        }
      });
    });
    this.validations.set(record, promise);
    this.drain();
    return promise;
  }
  private async check(record: IconRecord, force: boolean) {
    const selectionVersion = record.selectionVersion;
    try {
      this.current(record);
      record.status = 'scanning';
      record.error = null;
      this.changed(record);
      if (!(await fs.stat(record.repoPath)).isDirectory()) throw new Error('Repository directory is unavailable.');
      if (force || this.now() - record.scannedAt >= 300_000) {
        const found = await discoverRepositoryIcons(record.repoPath);
        this.current(record);
        if (record.selectionVersion !== selectionVersion) return;
        if (record.mode === 'auto' && record.thumbnail && JSON.stringify(record.candidates) !== JSON.stringify(found.candidates)) record.thumbnail = null;
        record.candidates = found.candidates;
        record.limited = found.limited;
        record.scannedAt = this.now();
      }
      const source = record.mode === 'manual' ? record.manualPath : record.thumbnail?.path;
      if (source) {
        try {
          const stat = await fs.stat(resolveExistingRepositoryPathWithoutSymlinks(record.repoPath, source));
          this.current(record);
          if (record.selectionVersion !== selectionVersion) return;
          if (!stat.isFile() || stat.size !== record.stamp?.bytes || stat.mtimeMs !== record.stamp?.mtimeMs) record.thumbnail = null;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          this.current(record);
          if (record.selectionVersion !== selectionVersion) return;
          record.thumbnail = null;
        }
      }
      // A newly discovered, higher-ranked candidate is considered by the renderer.
      if (force && record.mode === 'auto') record.thumbnail = null;
      record.status = 'ready';
      record.error = null;
      record.checkedAt = this.now();
      this.changed(record);
      this.persist(record);
    } catch (error) {
      if (!record.alive || record.selectionVersion !== selectionVersion) return;
      record.status = 'unavailable';
      record.error = error instanceof Error ? error.message : String(error);
      record.checkedAt = this.now();
      try {
        this.changed(record);
      } catch {
        /* Repository was removed during the check. */
      }
    }
  }
  async readSource(repo: string, relativePath: string) {
    const record = await this.record(repo);
    const source = await readRepositoryIconSource(record.repoPath, normalizeRepositoryRelativePath(relativePath));
    this.current(record);
    return source;
  }
  async choose(repo: string, choice: RepositoryIconChoiceDto) {
    const record = await this.record(repo);
    if (!choice || !['auto', 'manual', 'initials'].includes(choice.mode)) throw new Error('Invalid repository logo selection.');
    const manualPath = choice.mode === 'manual' ? normalizeRepositoryRelativePath(choice.path) : null;
    if (manualPath) await this.readSource(repo, manualPath);
    this.current(record);
    if (record.selectionVersion !== choice.expectedSelectionVersion) throw new Error('Repository logo selection changed. Reopen the selection dialog.');
    const previous = {
      mode: record.mode,
      manualPath: record.manualPath,
      selectionVersion: record.selectionVersion,
      thumbnail: record.thumbnail,
      stamp: record.stamp,
      checkedAt: record.checkedAt,
      status: record.status,
      error: record.error,
    };
    record.mode = choice.mode;
    record.manualPath = manualPath;
    record.selectionVersion = randomUUID();
    record.thumbnail = null;
    record.stamp = null;
    record.checkedAt = -Infinity;
    record.status = 'ready';
    record.error = null;
    try {
      this.persist(record);
    } catch (error) {
      Object.assign(record, previous);
      throw error;
    }
    this.changed(record);
    return this.get(repo, true);
  }
  async cache(repo: string, request: RepositoryIconCacheRequestDto) {
    const record = await this.record(repo);
    const png = this.deps.validatePng(request.dataUrl);
    const source = await this.readSource(repo, request.path);
    this.current(record);
    if (
      request.expectedRevision !== record.revision ||
      request.selectionVersion !== record.selectionVersion ||
      request.sourceVersion !== source.version ||
      record.mode === 'initials' ||
      (record.mode === 'manual' ? record.manualPath !== request.path : !record.candidates.includes(request.path))
    )
      throw new Error('Repository logo changed while its preview was being generated.');
    record.thumbnail = { path: source.path, version: source.version, dataUrl: png };
    record.stamp = { mtimeMs: source.mtimeMs, bytes: source.bytes };
    this.changed(record);
    this.persist(record);
    return this.snapshot(record);
  }
  retainRepositories(paths: string[]) {
    const retained = new Set(paths.map(repositoryPathKey));
    for (const [key, record] of this.records)
      if (!retained.has(key)) {
        record.alive = false;
        this.records.delete(key);
      }
    // Include unloaded disk entries, so removal before first display also cleans up.
    const files = new Set(paths.map((repo) => path.basename(this.file(repo))));
    void fs
      .readdir(this.deps.directory)
      .then(async (entries) => {
        for (const entry of entries)
          if (/^[a-f0-9]{64}\.json$/.test(entry) && !files.has(entry)) {
            const target = path.resolve(this.deps.directory, entry);
            if (path.dirname(target) === path.resolve(this.deps.directory) && !this.deps.storedPaths().some((repo) => path.basename(this.file(repo)) === entry))
              await fs.rm(target, { force: true });
          }
      })
      .catch(() => {});
  }
}
