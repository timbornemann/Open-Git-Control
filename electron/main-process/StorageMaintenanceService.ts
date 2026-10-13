import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { StoredData } from './repoStore';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { writeTextFileAtomically } from './atomicFile';
import { assertManagedPath, readStorageJson } from './storageSafety';
import { inventoryStorage, type StorageFile } from './storageCatalogue';
import { cacheLastUsed, isStorageBusy, onCacheUse } from './managedStorage';
import { protectedRepositoryReferences, pruneRepositoryMetadata, repositoryMetadataOwners } from './storageMetadata';
import { DAY, newMaintenanceState, parseMaintenanceState, type RepositoryObservation } from './maintenanceState';
import { cacheCandidates, recognizedCache, removeEmptyCacheDirectories, selectedCategory } from './storageCachePolicy';
import type { RecoveryInventory } from './storageRecoveryInventory';
import { storageOverview } from './storageOverview';
import { maintainBrowserCaches, isBrowserCacheFile } from './browserMaintenancePolicy';
import { type MaintenanceRequest, type MaintenanceReport, type StorageIssue, type StorageOverview } from '../../src/shared/ipc/storageMaintenance';
export { DAY } from './maintenanceState';

import type { MaintenanceDeps } from './StorageMaintenanceDependencies';
export type { MaintenanceDeps } from './StorageMaintenanceDependencies';
export class StorageMaintenanceService {
  private state = newMaintenanceState();
  private readonly now: () => number;
  private running: Promise<StorageOverview> | null = null;
  private queued = new Map<MaintenanceRequest['mode'], { request: MaintenanceRequest; promise: Promise<StorageOverview> }>();
  private pendingSave: NodeJS.Timeout | null = null;
  private unsubscribe: () => void;
  private loadError: Error | null = null;
  private stopped = false;
  private storedState: string | null = null;
  constructor(private readonly deps: MaintenanceDeps) {
    this.now = deps.now || Date.now;
    try {
      const raw = readStorageJson(deps.root, this.stateFile());
      this.storedState = JSON.stringify(raw);
      this.state = parseMaintenanceState(raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.loadError = error as Error;
    }
    this.unsubscribe = onCacheUse((file, usedAt) => {
      const relative = path.relative(deps.root, file).split(path.sep).join('/');
      if (relative.startsWith('../') || path.isAbsolute(relative) || this.loadError) return;
      this.state.usage[relative] = Math.max(this.state.usage[relative] || 0, usedAt);
      this.state.firstSeen[relative] ??= usedAt;
      if (!this.pendingSave) {
        this.pendingSave = setTimeout(() => {
          this.pendingSave = null;
          try {
            this.save();
          } catch {
            /* Retry at the next pass. */
          }
        }, 1000);
        this.pendingSave.unref();
      }
    });
  }
  private stateFile() {
    return path.join(this.deps.root, 'storage-maintenance-v1.json');
  }
  private save() {
    if (this.loadError) throw this.loadError;
    this.checkStateFile();
    assertManagedPath(this.deps.root, this.stateFile());
    const raw = JSON.stringify(this.state);
    writeTextFileAtomically(this.stateFile(), raw);
    this.storedState = raw;
  }
  private checkStateFile() {
    try {
      const raw = JSON.stringify(readStorageJson(this.deps.root, this.stateFile()));
      if (raw !== this.storedState) throw new Error('Maintenance state changed externally. Existing data was preserved.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || this.storedState !== null) {
        this.loadError = error as Error;
        throw error;
      }
    }
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe();
    if (this.pendingSave) clearTimeout(this.pendingSave);
    try {
      this.save();
    } catch {
      /* Preserve unreadable/future state. */
    }
  }
  /** Return tickets precede registry commits. Failed commits are reconciled on the next pass. */
  beforeRegistryChange(before: StoredData, after: StoredData) {
    if (this.loadError) return;
    const next = new Set(after.repos.map((repo) => repositoryPathKey(repo.path)));
    for (const entry of before.repos)
      if (!next.has(repositoryPathKey(entry.path)))
        this.state.removed[repositoryPathKey(entry.path)] = { entry: { ...entry }, removedAt: this.now(), expiresAt: this.now() + 30 * DAY };
    for (const entry of after.repos) {
      const key = repositoryPathKey(entry.path),
        ticket = this.state.removed[key];
      if (ticket && this.now() < ticket.expiresAt && !before.repos.some((repo) => repositoryPathKey(repo.path) === key))
        Object.assign(entry, { pinned: ticket.entry.pinned, createdAt: ticket.entry.createdAt });
      delete this.state.removed[key];
      delete this.state.orphanOwners[key];
    }
    this.state.known = after.repos.map((entry) => ({ ...entry }));
    this.save();
  }
  async restore(repo: string): Promise<StoredData> {
    if (this.running) await this.running;
    if (this.loadError) throw this.loadError;
    const key = repositoryPathKey(repo),
      ticket = this.state.removed[key];
    if (!ticket || this.now() >= ticket.expiresAt) throw new Error('The repository return period expired.');
    if ((await this.deps.probe(ticket.entry.path)) !== 'available') throw new Error('The repository is not available. Locate it before reopening.');
    this.assertRunning();
    const current = this.deps.readRepos();
    if (!current.repos.some((entry) => repositoryPathKey(entry.path) === key)) {
      const latest = this.state.removed[key];
      if (!latest || this.now() >= latest.expiresAt) throw new Error('The repository return period expired.');
      this.deps.writeRepos({ ...current, repos: [...current.repos, latest.entry] });
    }
    delete this.state.removed[key];
    delete this.state.observations[key];
    this.save();
    return this.deps.readRepos();
  }
  async repositoryRelocated(oldPath: string): Promise<void> {
    if (this.loadError) return;
    const key = repositoryPathKey(oldPath),
      hash = createHash('sha256').update(key).digest('hex');
    const files = await inventoryStorage(this.deps.root, []);
    for (const file of files) {
      let matches = file.category === 'analytics' && file.relative.split('/')[2] === hash;
      if (file.category === 'previews' || (file.category === 'analytics' && file.relative.endsWith('snapshot.json')))
        try {
          const value = readStorageJson(this.deps.root, file.file) as { key?: unknown[]; repoPath?: string };
          const owner = value.repoPath || value.key?.[2];
          matches ||= typeof owner === 'string' && repositoryPathKey(owner) === key;
        } catch {
          /* Unknown formats remain protected. */
        }
      if (matches) this.state.invalidated.push(file.relative);
    }
    this.state.invalidated = [...new Set(this.state.invalidated)];
    delete this.state.removed[key];
    delete this.state.observations[key];
    this.state.orphanOwners[key] ??= { path: oldPath, observedAt: this.now() };
    this.save();
    await this.run({ mode: 'eligible', categories: ['previews', 'analytics'] });
  }
  inspect(): Promise<StorageOverview> {
    return this.execute();
  }
  recoveryDirectories(): string[] {
    if (this.loadError) return [];
    this.assertRunning();
    return [...new Set(Object.values(this.state.commonDirectories))];
  }
  run(request: MaintenanceRequest): Promise<StorageOverview> {
    return this.execute(request);
  }
  private execute(request?: MaintenanceRequest): Promise<StorageOverview> {
    if (this.stopped) return Promise.reject(new Error('Maintenance stopped.'));
    if (this.running) {
      if (!request) return this.running;
      const existing = this.queued.get(request.mode);
      if (existing) {
        existing.request.categories =
          !existing.request.categories || !request.categories ? undefined : [...new Set([...existing.request.categories, ...request.categories])];
        return existing.promise;
      }
      const queuedRequest = { ...request };
      const promise = this.running
        .catch(() => undefined)
        .then(() => {
          this.queued.delete(request.mode);
          return this.execute(queuedRequest);
        });
      this.queued.set(request.mode, { request: queuedRequest, promise });
      return promise;
    }
    const running = this.perform(request)
      .catch(async (error) => {
        if (request || this.stopped) throw error;
        const issues: StorageIssue[] = [{ category: 'metadata', path: 'repos.json / storage-maintenance-v1.json', reason: 'metadata-unreadable' }];
        const files = await inventoryStorage(this.deps.root, issues);
        const overview = storageOverview({
          now: this.now(),
          files,
          state: this.state,
          data: { repos: this.state.known, activeRepo: null, sortBy: 'nameAsc' },
          issues,
          recovery: await this.recovery(),
          temporary: this.deps.temporary?.() || [],
        });
        return { ...overview, blockedReason: error instanceof Error ? error.message : String(error) };
      })
      .finally(() => {
        if (this.running === running) this.running = null;
      });
    this.running = running;
    return running;
  }
  private assertRunning() {
    if (this.stopped) throw new Error('Maintenance stopped.');
    this.checkStateFile();
  }
  private recovery(directories = this.state.commonDirectories): Promise<RecoveryInventory> {
    return this.deps.recoveryInventory?.(directories) || Promise.resolve({ bytes: 0, files: 0, protectedPaths: new Set(), issues: [] });
  }
  private temporary(now: number) {
    const entries = this.deps.temporary?.() || [],
      existing = new Set(entries.map((entry) => entry.directory));
    for (const directory of Object.keys(this.state.temporarySeen)) if (!existing.has(directory)) delete this.state.temporarySeen[directory];
    return entries.map((entry) => {
      if (entry.unclear) return entry;
      this.state.temporarySeen[entry.directory] ??= now;
      return { ...entry, eligible: entry.eligible && now - this.state.temporarySeen[entry.directory] >= 7 * DAY };
    });
  }
  private async checkRepositories(
    data: StoredData,
    request: MaintenanceRequest | undefined,
    startedAt: number,
    protectedPaths: Set<string>,
    issues: StorageIssue[],
    report: MaintenanceReport,
  ) {
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(2, data.repos.length) }, async () => {
        while (index < data.repos.length) {
          this.assertRunning();
          const repo = data.repos[index++],
            key = repositoryPathKey(repo.path);
          const health = await this.deps.probe(repo.path).catch(() => 'unreachable' as const);
          const common = health === 'available' && this.deps.commonDirectory?.(repo.path);
          if (common) this.state.commonDirectories[key] = common;
          const prior = this.state.observations[key];
          const observation: RepositoryObservation =
            health === 'missing'
              ? {
                  health,
                  missingSince: prior?.health === 'missing' ? prior.missingSince : startedAt,
                  days: [...new Set([...(prior?.health === 'missing' ? prior.days : []), new Date(startedAt).toISOString().slice(0, 10)])].slice(-3),
                }
              : { health, missingSince: null, days: [] };
          this.state.observations[key] = observation;
          if (health !== 'available') issues.push({ category: 'metadata', path: repo.path, reason: health });
          if (
            !request ||
            request.mode !== 'eligible' ||
            !selectedCategory(request, 'metadata') ||
            observation.missingSince === null ||
            startedAt - observation.missingSince < 90 * DAY ||
            observation.days.length < 3
          )
            continue;
          const current = this.deps.readRepos();
          const recovery = await this.recovery(this.state.commonDirectories[key] ? { [key]: this.state.commonDirectories[key] } : {});
          for (const protectedKey of recovery.protectedPaths) protectedPaths.add(protectedKey);
          if (protectedPaths.has(key) || (current.activeRepo && repositoryPathKey(current.activeRepo) === key) || this.deps.isRepoBusy(repo.path)) {
            report.deferred.push({ category: 'metadata', path: repo.path, reason: 'in-use-or-recovery' });
            continue;
          }
          if ((await this.deps.probe(repo.path).catch(() => 'unreachable')) !== 'missing') {
            delete this.state.observations[key];
            continue;
          }
          this.assertRunning();
          const latest = this.deps.readRepos();
          if (
            (latest.activeRepo && repositoryPathKey(latest.activeRepo) === key) ||
            this.deps.isRepoBusy(repo.path) ||
            protectedRepositoryReferences(this.deps.root).has(key)
          )
            continue;
          const entry = latest.repos.find((candidate) => repositoryPathKey(candidate.path) === key);
          if (!entry) continue;
          const next = { ...latest, repos: latest.repos.filter((candidate) => candidate !== entry) };
          this.beforeRegistryChange(latest, next);
          this.deps.writeRepos(next);
          report.removedRepositories.push(entry.path);
          issues.push({ category: 'metadata', path: repo.path, reason: 'missing-90-days' });
        }
      }),
    );
  }
  private async inventory(issues: StorageIssue[], now: number): Promise<StorageFile[]> {
    const files = await inventoryStorage(this.deps.root, issues);
    for (const file of files)
      if (file.managed || file.relative.startsWith('repository-icons/')) {
        try {
          if (!(await recognizedCache(this.deps.root, file))) throw new Error('Unsupported format.');
        } catch {
          file.category = 'unknown';
          file.managed = false;
          issues.push({ category: 'unknown', path: file.relative, reason: 'unsupported-format' });
        }
        this.state.firstSeen[file.relative] ??= now;
        this.state.usage[file.relative] = Math.max(this.state.usage[file.relative] ?? now, cacheLastUsed(file.file) || 0);
      }
    const existing = new Set(files.map((file) => file.relative));
    this.state.invalidated = this.state.invalidated.filter((file) => existing.has(file));
    for (const relative of Object.keys(this.state.usage))
      if (!existing.has(relative)) {
        delete this.state.usage[relative];
        delete this.state.firstSeen[relative];
      }
    if (this.deps.updatesDirectory) {
      const updates = await inventoryStorage(this.deps.updatesDirectory, issues);
      files.push(...updates.map((file) => ({ ...file, relative: `@updates/${file.relative}`, category: 'updates' as const, managed: false })));
    }
    return files;
  }
  private async cleanCaches(files: StorageFile[], request: MaintenanceRequest, startedAt: number, issues: StorageIssue[], report: MaintenanceReport) {
    const candidates = cacheCandidates(files, this.state, startedAt, request);
    const stats = files.find((file) => file.category === 'statistics');
    if (stats && selectedCategory(request, 'statistics') && !candidates.includes(stats)) candidates.push(stats);
    for (const file of candidates) {
      try {
        this.assertRunning();
        assertManagedPath(this.deps.root, file.file);
        if (isStorageBusy(file.file) || (cacheLastUsed(file.file) || 0) > startedAt) {
          report.deferred.push({ category: file.category, path: file.relative, reason: 'in-use' });
          continue;
        }
        if (!(await recognizedCache(this.deps.root, file))) {
          issues.push({ category: 'unknown', path: file.relative, reason: 'unsupported-format' });
          continue;
        }
        this.assertRunning();
        const stat = fs.lstatSync(file.file);
        if (isStorageBusy(file.file) || stat.size !== file.bytes || stat.mtimeMs !== file.mtimeMs || (cacheLastUsed(file.file) || 0) > startedAt) {
          report.deferred.push({ category: file.category, path: file.relative, reason: 'changed-during-inspection' });
          continue;
        }
        assertManagedPath(this.deps.root, file.file);
        if (file.category === 'statistics') {
          const cutoff = startedAt - (this.state.firstSeen[file.relative] ?? startedAt) >= 30 * DAY ? startedAt - 30 * DAY : 0;
          if (!(await this.deps.maintainStatistics?.(request.mode === 'all-caches', cutoff))) {
            report.deferred.push({ category: 'statistics', path: file.relative, reason: 'in-use-or-unsupported' });
            continue;
          }
        } else if (file.relative.startsWith('repository-icons/')) {
          const value = readStorageJson(this.deps.root, file.file) as { repoPath: string };
          if (!this.deps.clearIcon?.(value.repoPath)) {
            report.deferred.push({ category: 'auxiliary', path: file.relative, reason: 'in-use-or-unsupported' });
            continue;
          }
        } else {
          fs.unlinkSync(file.file);
          if (file.category === 'analytics') this.deps.invalidateAnalytics?.();
        }
        report.removedBytes += Math.max(0, stat.size - (fs.existsSync(file.file) ? fs.statSync(file.file).size : 0));
        if (!fs.existsSync(file.file)) report.removedFiles++;
        const removed = {
          category: file.category,
          path: file.relative,
          reason:
            request.mode === 'all-caches'
              ? 'cache-cleared'
              : this.state.invalidated.includes(file.relative)
                ? 'cache-location-changed'
                : startedAt - (this.state.usage[file.relative] ?? startedAt) >= 30 * DAY
                  ? 'cache-unused'
                  : 'cache-budget',
        };
        issues.push(removed);
        (report.removed ??= []).push(removed);
      } catch (error) {
        report.errors.push(`${file.relative}: ${String(error)}`);
      }
    }
    try {
      removeEmptyCacheDirectories(this.deps.root);
    } catch (error) {
      report.errors.push(String(error));
    }
  }
  private cleanMetadata(data: StoredData, startedAt: number, report: MaintenanceReport, recovery: RecoveryInventory) {
    const owners = repositoryMetadataOwners(this.deps.root),
      current = new Set(data.repos.map((entry) => repositoryPathKey(entry.path)));
    if (data.activeRepo) current.add(repositoryPathKey(data.activeRepo));
    for (const [key, repo] of owners) if (!current.has(key) && !this.state.removed[key]) this.state.orphanOwners[key] ??= { path: repo, observedAt: startedAt };
    for (const key of Object.keys(this.state.orphanOwners)) if (current.has(key) || !owners.has(key)) delete this.state.orphanOwners[key];
    const protectedPaths = protectedRepositoryReferences(this.deps.root),
      expired = new Set<string>();
    for (const key of recovery.protectedPaths) protectedPaths.add(key);
    for (const [key, ticket] of Object.entries(this.state.removed))
      if (startedAt >= ticket.expiresAt && !current.has(key) && !protectedPaths.has(key) && !this.deps.isRepoBusy(ticket.entry.path)) expired.add(key);
    for (const [key, owner] of Object.entries(this.state.orphanOwners))
      if (startedAt - owner.observedAt >= 30 * DAY && !current.has(key) && !protectedPaths.has(key) && !this.deps.isRepoBusy(owner.path)) expired.add(key);
    report.removedBytes += pruneRepositoryMetadata(this.deps.root, expired, false, () => report.removedFiles++);
    for (const key of expired) (report.removed ??= []).push({ category: 'metadata', path: key, reason: 'return-period-expired' });
    for (const key of expired) {
      delete this.state.removed[key];
      delete this.state.orphanOwners[key];
      delete this.state.observations[key];
      if (!recovery.retainedPaths?.has(key)) delete this.state.commonDirectories[key];
    }
  }
  private async perform(request?: MaintenanceRequest): Promise<StorageOverview> {
    if (this.loadError) throw new Error('Maintenance state is unreadable; automatic deletion is disabled.', { cause: this.loadError });
    const startedAt = this.now(),
      issues: StorageIssue[] = [];
    const report: MaintenanceReport = { startedAt, finishedAt: startedAt, removedBytes: 0, removedFiles: 0, removedRepositories: [], deferred: [], errors: [] };
    const data = this.deps.readRepos();
    this.beforeRegistryChange({ repos: this.state.known, activeRepo: null, sortBy: data.sortBy }, data);
    let protectedPaths = new Set<string>();
    try {
      protectedPaths = protectedRepositoryReferences(this.deps.root);
    } catch (error) {
      protectedPaths = new Set(data.repos.map((entry) => repositoryPathKey(entry.path)));
      issues.push({ category: 'protected', path: '', reason: 'metadata-unreadable' });
      report.errors.push(String(error));
    }
    await this.checkRepositories(data, request, startedAt, protectedPaths, issues, report);
    let recovery = await this.recovery();
    const temporary = this.temporary(startedAt);
    let files = await this.inventory(issues, startedAt);
    this.assertRunning();
    try {
      const owners = repositoryMetadataOwners(this.deps.root),
        current = new Set(this.deps.readRepos().repos.map((entry) => repositoryPathKey(entry.path)));
      for (const [key, repo] of owners)
        if (!current.has(key) && !this.state.removed[key]) this.state.orphanOwners[key] ??= { path: repo, observedAt: startedAt };
    } catch (error) {
      report.errors.push(String(error));
      issues.push({ category: 'metadata', path: '', reason: 'metadata-unreadable' });
    }
    if (request) {
      await this.cleanCaches(files, request, startedAt, issues, report);
      if (request.mode === 'eligible' && selectedCategory(request, 'metadata') && !report.errors.length)
        try {
          recovery = await this.recovery();
          this.assertRunning();
          this.cleanMetadata(this.deps.readRepos(), startedAt, report, recovery);
        } catch (error) {
          report.errors.push(String(error));
        }
      this.assertRunning();
      await maintainBrowserCaches(this.deps, this.state, request, startedAt, files, report);
      this.assertRunning();
      if (request.mode === 'eligible' && selectedCategory(request, 'temporary') && this.deps.cleanTemporary)
        try {
          const removed = this.deps.cleanTemporary(new Set(temporary.filter((entry) => entry.eligible).map((entry) => entry.directory)));
          report.removedBytes += removed.bytes;
          report.removedFiles += removed.files;
        } catch (error) {
          report.errors.push(String(error));
        }
      const previousBrowserFiles = files.filter(isBrowserCacheFile);
      files = await this.inventory(issues, startedAt);
      const currentBrowserFiles = files.filter(isBrowserCacheFile);
      report.removedBytes += Math.max(
        0,
        previousBrowserFiles.reduce((sum, file) => sum + file.bytes, 0) - currentBrowserFiles.reduce((sum, file) => sum + file.bytes, 0),
      );
      report.removedFiles += Math.max(0, previousBrowserFiles.length - currentBrowserFiles.length);
      report.finishedAt = this.now();
      report.errors = report.errors.slice(0, 100).map((error) => error.slice(0, 2000));
      report.deferred = report.deferred.slice(0, 200);
      if (report.removed) report.removed = report.removed.slice(0, 200);
      this.state.reports.push(report);
      while (this.state.reports.length > 30 || Buffer.byteLength(JSON.stringify(this.state.reports)) > 1024 ** 2) this.state.reports.shift();
    }
    for (const category of ['http', 'code', 'auxiliary']) this.state.browserClearedAt[category] ??= startedAt;
    const current = this.deps.readRepos(),
      owners = new Set([...current.repos.map((entry) => repositoryPathKey(entry.path)), ...Object.keys(this.state.removed)]);
    for (const key of Object.keys(this.state.observations)) if (!owners.has(key)) delete this.state.observations[key];
    for (const key of Object.keys(this.state.commonDirectories))
      if (!owners.has(key) && !this.state.orphanOwners[key] && !recovery.retainedPaths?.has(key)) delete this.state.commonDirectories[key];
    this.state.known = current.repos.map((entry) => ({ ...entry }));
    this.assertRunning();
    this.save();
    return storageOverview({
      now: this.now(),
      files,
      state: this.state,
      data: current,
      issues,
      recovery,
      temporary: this.temporary(startedAt),
      metadata: { root: this.deps.root, isRepoBusy: this.deps.isRepoBusy },
    });
  }
}
